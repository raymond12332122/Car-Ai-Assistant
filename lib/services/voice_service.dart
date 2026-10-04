import 'dart:async';

import 'package:flutter_tts/flutter_tts.dart';
import 'package:speech_to_text/speech_recognition_result.dart';
import 'package:speech_to_text/speech_to_text.dart';

import '../config.dart';

/// On-device speech recognition + text-to-speech.
class VoiceService {
  final SpeechToText _stt = SpeechToText();
  final FlutterTts _tts = FlutterTts();
  bool _sttReady = false;

  Future<void> init() async {
    // Google's engine has far more natural Spanish voices than most OEM engines.
    try {
      final engines = (await _tts.getEngines as List?)?.cast<String>() ?? const [];
      if (engines.contains('com.google.android.tts')) {
        await _tts.setEngine('com.google.android.tts');
      }
    } catch (_) {}
    await _tts.setLanguage(AppConfig.language);
    await _pickBestSpanishVoice();
    await _tts.setSpeechRate(0.5); // flutter_tts: 0.5 = normal speed on Android
    await _tts.setPitch(1.0);
    await _tts.awaitSpeakCompletion(true);
    // Duck other audio (music, navigation) while the assistant talks.
    await _tts.setAudioAttributesForNavigation();
  }

  /// Picks an installed Spanish voice, preferring the app's locale, then
  /// Latin-American Spanish, then any Spanish. Without this some phones read
  /// Spanish with an English voice, which sounds "raro".
  Future<void> _pickBestSpanishVoice() async {
    try {
      final raw = (await _tts.getVoices as List?) ?? const [];
      final voices = raw
          .whereType<Map>()
          .map((v) => {
                'name': '${v['name'] ?? ''}',
                'locale': '${v['locale'] ?? ''}'.replaceAll('_', '-'),
              })
          .where((v) => v['locale']!.toLowerCase().startsWith('es'))
          .where((v) => !v['name']!.contains('notInstalled'))
          .toList();
      if (voices.isEmpty) return;
      int score(Map<String, String> v) {
        final locale = v['locale']!.toLowerCase();
        final name = v['name']!.toLowerCase();
        var s = 0;
        if (locale == AppConfig.language.toLowerCase()) s += 100;
        if (locale == 'es-us' || locale == 'es-419') s += 60;
        if (locale.startsWith('es-')) s += 10;
        if (name.contains('local')) s += 5; // offline: no lag in tunnels
        return s;
      }
      voices.sort((a, b) => score(b).compareTo(score(a)));
      await _tts.setVoice(voices.first);
    } catch (_) {
      // Keep the engine's default voice for the language.
    }
  }

  Future<bool> _ensureStt() async {
    if (_sttReady) return true;
    _sttReady = await _stt.initialize(onError: (_) {}, onStatus: (_) {});
    return _sttReady;
  }

  bool get isListening => _stt.isListening;

  /// Listens once and completes with the final transcript ('' if nothing).
  Future<String> listenOnce({void Function(String partial)? onPartial}) async {
    if (!await _ensureStt()) {
      throw StateError('Reconocimiento de voz no disponible en este dispositivo.');
    }
    await _tts.stop();
    final completer = Completer<String>();
    var last = '';
    await _stt.listen(
      listenOptions: SpeechListenOptions(
        localeId: AppConfig.language.replaceAll('-', '_'),
        listenFor: const Duration(seconds: 15),
        pauseFor: const Duration(seconds: 2),
        partialResults: true,
        listenMode: ListenMode.confirmation,
        cancelOnError: true,
      ),
      onResult: (SpeechRecognitionResult r) {
        last = r.recognizedWords;
        onPartial?.call(last);
        if (r.finalResult && !completer.isCompleted) completer.complete(last);
      },
    );
    // Safety net: if the engine stops without a final result.
    unawaited(() async {
      while (_stt.isListening) {
        await Future<void>.delayed(const Duration(milliseconds: 250));
      }
      await Future<void>.delayed(const Duration(milliseconds: 400));
      if (!completer.isCompleted) completer.complete(last);
    }());
    return completer.future;
  }

  Future<void> stopListening() => _stt.stop();

  Future<void> speak(String text) async {
    if (text.trim().isEmpty) return;
    await _tts.stop();
    await _tts.speak(text);
  }

  Future<void> stopSpeaking() => _tts.stop();
}

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
    await _tts.setLanguage(AppConfig.language);
    await _tts.setSpeechRate(0.5);
    await _tts.awaitSpeakCompletion(true);
    // Duck other audio (music, navigation) while the assistant talks.
    await _tts.setAudioAttributesForNavigation();
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

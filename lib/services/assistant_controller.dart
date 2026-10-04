import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../config.dart';
import '../models.dart';
import 'assistant_api.dart';
import 'location_service.dart';
import 'voice_service.dart';

enum AssistantStatus { idle, listening, thinking, speaking, error }

class AssistantController extends ChangeNotifier {
  AssistantController({
    AssistantApi? api,
    VoiceService? voice,
    LocationService? location,
  })  : _api = api ?? AssistantApi(),
        _voice = voice ?? VoiceService(),
        _location = location ?? LocationService();

  static const _historyKey = 'copiloto.history.v1';
  /// Also read by the Android Auto screens (FlutterSharedPreferences, key "flutter.copiloto.model").
  static const modelKey = 'copiloto.model';

  final AssistantApi _api;
  final VoiceService _voice;
  final LocationService _location;

  AssistantStatus status = AssistantStatus.idle;
  AssistantReply? lastReply;
  String? transcript;
  String? error;
  bool voiceEnabled = true;
  List<ChatMessage> history = [];
  ModelCatalog? catalog;
  String? selectedModel;

  /// Model actually sent: the user's pick if its key is connected, else the server default.
  String? get activeModel {
    final c = catalog;
    if (c == null) return selectedModel;
    final picked = c.models.where((m) => m.id == selectedModel && m.available);
    return picked.isNotEmpty ? picked.first.id : c.defaultModel;
  }

  Future<void> init() async {
    await _voice.init();
    try {
      final prefs = await SharedPreferences.getInstance();
      selectedModel = prefs.getString(modelKey);
      final raw = prefs.getString(_historyKey);
      if (raw != null) {
        history = (jsonDecode(raw) as List)
            .map((m) => ChatMessage.fromJson(m as Map<String, dynamic>))
            .toList();
      }
    } catch (_) {
      history = [];
    }
    notifyListeners();
    await refreshModels();
  }

  Future<void> refreshModels() async {
    try {
      catalog = await _api.models();
    } catch (_) {
      // Keep the last known catalog; chat still works with the server default.
    }
    notifyListeners();
  }

  Future<void> selectModel(String id) async {
    selectedModel = id;
    notifyListeners();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(modelKey, id);
    } catch (_) {}
  }

  void _set(AssistantStatus s) {
    status = s;
    notifyListeners();
  }

  Future<void> listen() async {
    if (status == AssistantStatus.listening) {
      await _voice.stopListening();
      return;
    }
    if (status == AssistantStatus.thinking) return;
    error = null;
    transcript = null;
    _set(AssistantStatus.listening);
    try {
      final text = await _voice.listenOnce(onPartial: (p) {
        transcript = p;
        notifyListeners();
      });
      if (text.trim().isEmpty) {
        _set(AssistantStatus.idle);
        return;
      }
      await ask(text);
    } catch (e) {
      error = e.toString();
      _set(AssistantStatus.error);
    }
  }

  Future<void> ask(String text) async {
    final trimmed = text.trim();
    if (trimmed.isEmpty) return;
    error = null;
    transcript = trimmed;
    _set(AssistantStatus.thinking);
    try {
      final location = await _location.current();
      final messages = [
        ...history,
        ChatMessage(role: 'user', content: trimmed),
      ];
      final reply = await _api.chat(
        messages: messages.length > 20 ? messages.sublist(messages.length - 20) : messages,
        location: location,
        model: activeModel,
      );
      lastReply = reply;
      history = [
        ...messages,
        ChatMessage(role: 'assistant', content: reply.reply),
      ];
      if (history.length > AppConfig.maxHistory) {
        history = history.sublist(history.length - AppConfig.maxHistory);
      }
      _persist();
      if (voiceEnabled) {
        _set(AssistantStatus.speaking);
        await _voice.speak(reply.speech);
      }
      _set(AssistantStatus.idle);
    } on AssistantException catch (e) {
      error = e.message;
      _set(AssistantStatus.error);
    } catch (e) {
      error = 'Algo salió mal: $e';
      _set(AssistantStatus.error);
    }
  }

  void toggleVoice() {
    voiceEnabled = !voiceEnabled;
    if (!voiceEnabled) _voice.stopSpeaking();
    notifyListeners();
  }

  Future<void> speak(String text) => _voice.speak(text);

  void clear() {
    history = [];
    lastReply = null;
    transcript = null;
    error = null;
    _persist();
    _set(AssistantStatus.idle);
  }

  Future<void> _persist() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(
          _historyKey, jsonEncode(history.map((m) => m.toJson()).toList()));
    } catch (_) {}
  }
}

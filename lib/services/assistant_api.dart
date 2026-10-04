import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config.dart';
import '../models.dart';

class AssistantException implements Exception {
  AssistantException(this.message, {this.code});

  final String message;
  final String? code;

  @override
  String toString() => message;
}

/// Client for the Floot backend (`/_api/assistant/*`).
///
/// Floot endpoints speak superjson: responses are wrapped as `{"json": ...}`.
/// Plain JSON request bodies are accepted.
class AssistantApi {
  AssistantApi({http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        _baseUrl = baseUrl ?? AppConfig.backendUrl;

  final http.Client _client;
  final String _baseUrl;

  Future<AssistantReply> chat({
    required List<ChatMessage> messages,
    GeoPoint? location,
    String surface = 'phone',
    String? model,
  }) {
    return _post('/_api/assistant/chat', {
      'messages': messages.map((m) => m.toJson()).toList(),
      'location': location?.toJson(),
      'language': AppConfig.language,
      'surface': surface,
      'model': ?model,
    });
  }

  /// Models offered by the backend and whether each API key is connected.
  Future<ModelCatalog> models() async {
    try {
      final res = await _client
          .get(Uri.parse('$_baseUrl/_api/assistant/models'))
          .timeout(const Duration(seconds: 20));
      final decoded = _unwrap(res.body);
      if (res.statusCode != 200 || decoded is! Map<String, dynamic>) {
        throw AssistantException('No se pudo cargar la lista de modelos.');
      }
      return ModelCatalog.fromJson(decoded);
    } on AssistantException {
      rethrow;
    } catch (_) {
      throw AssistantException('Sin conexión con Copiloto.');
    }
  }

  Future<AssistantReply> _post(String path, Map<String, dynamic> body) async {
    final http.Response res;
    try {
      res = await _client
          .post(
            Uri.parse('$_baseUrl$path'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode(body),
          )
          .timeout(const Duration(seconds: 60));
    } catch (_) {
      throw AssistantException('Sin conexión con Copiloto. Revisa tus datos móviles.');
    }

    final decoded = _unwrap(res.body);
    if (res.statusCode != 200) {
      final error = decoded is Map ? decoded['error'] as String? : null;
      final code = decoded is Map ? decoded['code'] as String? : null;
      throw AssistantException(
        code == 'OUT_OF_CREDITS'
            ? 'El asistente no está disponible por ahora.'
            : (error ?? 'Error ${res.statusCode}'),
        code: code,
      );
    }
    return AssistantReply.fromJson(decoded as Map<String, dynamic>);
  }

  static dynamic _unwrap(String body) {
    try {
      final raw = jsonDecode(body);
      if (raw is Map && raw.containsKey('json')) return raw['json'];
      return raw;
    } catch (_) {
      return {'error': 'Respuesta inválida del servidor'};
    }
  }
}

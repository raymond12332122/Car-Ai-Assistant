import 'dart:convert';

import 'package:copiloto/models.dart';
import 'package:copiloto/services/assistant_api.dart';
import 'package:copiloto/services/assistant_controller.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  test('parses a superjson-wrapped reply with places', () async {
    late Map<String, dynamic> sent;
    final api = AssistantApi(
      baseUrl: 'https://example.test',
      client: MockClient((req) async {
        expect(req.url.path, '/_api/assistant/chat');
        sent = jsonDecode(req.body) as Map<String, dynamic>;
        return http.Response(
          jsonEncode({
            'json': {
              'reply': 'La Pemex más cercana está a 882 metros.',
              'speech': 'Pemex a 880 metros.',
              'action': {
                'type': 'show_places',
                'destinationName': null,
                'lat': null,
                'lng': null,
                'address': null,
                'phone': null,
              },
              'places': [
                {
                  'id': 'node/1',
                  'name': 'Pemex',
                  'category': 'fuel',
                  'lat': 19.427,
                  'lng': -99.139,
                  'distanceMeters': 882,
                  'address': 'Calle Simón Bolívar',
                  'phone': null,
                  'openingHours': null,
                },
              ],
            },
          }),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }),
    );

    final reply = await api.chat(
      messages: const [ChatMessage(role: 'user', content: 'gasolina')],
      location: const GeoPoint(lat: 19.43, lng: -99.13),
      model: 'claude-haiku-4-5',
    );

    expect(sent['surface'], 'phone');
    expect(sent['model'], 'claude-haiku-4-5');
    expect((sent['location'] as Map)['lat'], 19.43);
    expect(reply.action.type, 'show_places');
    expect(reply.action.canNavigate, isFalse);
    expect(reply.places.single.distanceLabel, '882 m');
  });

  test('maps OUT_OF_CREDITS to a friendly error', () async {
    final api = AssistantApi(
      baseUrl: 'https://example.test',
      client: MockClient((_) async => http.Response(
            jsonEncode({
              'json': {'error': 'x', 'code': 'OUT_OF_CREDITS'},
            }),
            503,
          )),
    );
    expect(
      () => api.chat(messages: const [ChatMessage(role: 'user', content: 'hola')]),
      throwsA(isA<AssistantException>()
          .having((e) => e.code, 'code', 'OUT_OF_CREDITS')),
    );
  });

  test('parses the model catalog', () async {
    final api = AssistantApi(
      baseUrl: 'https://example.test',
      client: MockClient((_) async => http.Response(
            jsonEncode({
              'json': {
                'defaultModel': 'gpt-6-luna',
                'voiceAvailable': true,
                'models': [
                  {'id': 'claude-opus-5-5', 'provider': 'anthropic', 'label': 'Claude Opus 5.5', 'note': '', 'available': false},
                  {'id': 'gpt-6-luna', 'provider': 'openai', 'label': 'GPT-6 Luna', 'note': '', 'available': true},
                ],
              },
            }),
            200,
          )),
    );
    final catalog = await api.models();
    expect(catalog.defaultModel, 'gpt-6-luna');
    expect(catalog.models.where((m) => m.available).single.id, 'gpt-6-luna');
  });

  test('navigate action exposes coordinates', () {
    final a = AssistantAction.fromJson(
        {'type': 'navigate', 'lat': 19.30, 'lng': -99.15, 'destinationName': 'Estadio'});
    expect(a.canNavigate, isTrue);
    expect(const Place(id: 'a', name: 'b', category: 'c', lat: 0, lng: 0, distanceMeters: 1450)
        .distanceLabel, '1.4 km');
  });

  test('only explicit requests count as navigation', () {
    for (final t in [
      'Inicia la navegación a la gasolinera más cercana',
      'Llévame a un hospital',
      'Vamos al Estadio Azteca',
      '¿Cómo llego a Polanco?',
      'Ponme la ruta a casa',
    ]) {
      expect(AssistantController.wantsNavigation(t), isTrue, reason: t);
    }
    for (final t in [
      'Cuéntame algo mientras manejo',
      '¿Dónde hay gasolineras?',
      '¿Cómo está el clima?',
      'Dime un chiste',
    ]) {
      expect(AssistantController.wantsNavigation(t), isFalse, reason: t);
    }
  });
}

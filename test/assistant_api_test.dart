import 'dart:convert';

import 'package:copiloto/models.dart';
import 'package:copiloto/services/assistant_api.dart';
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
    );

    expect(sent['surface'], 'phone');
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

  test('navigate action exposes coordinates', () {
    final a = AssistantAction.fromJson(
        {'type': 'navigate', 'lat': 19.30, 'lng': -99.15, 'destinationName': 'Estadio'});
    expect(a.canNavigate, isTrue);
    expect(const Place(id: 'a', name: 'b', category: 'c', lat: 0, lng: 0, distanceMeters: 1450)
        .distanceLabel, '1.4 km');
  });
}

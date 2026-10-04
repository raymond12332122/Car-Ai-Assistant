class ChatMessage {
  const ChatMessage({required this.role, required this.content});

  final String role; // "user" | "assistant"
  final String content;

  Map<String, dynamic> toJson() => {'role': role, 'content': content};

  factory ChatMessage.fromJson(Map<String, dynamic> json) => ChatMessage(
        role: json['role'] as String,
        content: json['content'] as String,
      );
}

class GeoPoint {
  const GeoPoint({required this.lat, required this.lng, this.speedKmh});

  final double lat;
  final double lng;
  final double? speedKmh;

  Map<String, dynamic> toJson() => {
        'lat': lat,
        'lng': lng,
        if (speedKmh != null) 'speedKmh': speedKmh,
      };
}

class Place {
  const Place({
    required this.id,
    required this.name,
    required this.category,
    required this.lat,
    required this.lng,
    this.distanceMeters,
    this.address,
    this.phone,
    this.openingHours,
  });

  final String id;
  final String name;
  final String category;
  final double lat;
  final double lng;
  final int? distanceMeters;
  final String? address;
  final String? phone;
  final String? openingHours;

  factory Place.fromJson(Map<String, dynamic> json) => Place(
        id: json['id'] as String,
        name: json['name'] as String,
        category: json['category'] as String? ?? '',
        lat: (json['lat'] as num).toDouble(),
        lng: (json['lng'] as num).toDouble(),
        distanceMeters: (json['distanceMeters'] as num?)?.round(),
        address: json['address'] as String?,
        phone: json['phone'] as String?,
        openingHours: json['openingHours'] as String?,
      );

  String get distanceLabel {
    final d = distanceMeters;
    if (d == null) return '';
    return d >= 1000 ? '${(d / 1000).toStringAsFixed(1)} km' : '$d m';
  }
}

class AssistantAction {
  const AssistantAction({
    required this.type,
    this.destinationName,
    this.lat,
    this.lng,
    this.address,
    this.phone,
  });

  /// "none" | "navigate" | "show_places" | "call"
  final String type;
  final String? destinationName;
  final double? lat;
  final double? lng;
  final String? address;
  final String? phone;

  bool get canNavigate => type == 'navigate' && lat != null && lng != null;

  factory AssistantAction.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const AssistantAction(type: 'none');
    return AssistantAction(
      type: json['type'] as String? ?? 'none',
      destinationName: json['destinationName'] as String?,
      lat: (json['lat'] as num?)?.toDouble(),
      lng: (json['lng'] as num?)?.toDouble(),
      address: json['address'] as String?,
      phone: json['phone'] as String?,
    );
  }
}

class AssistantReply {
  const AssistantReply({
    required this.reply,
    required this.speech,
    required this.action,
    required this.places,
    this.transcript,
  });

  final String reply;
  final String speech;
  final AssistantAction action;
  final List<Place> places;
  final String? transcript;

  factory AssistantReply.fromJson(Map<String, dynamic> json) => AssistantReply(
        reply: json['reply'] as String? ?? '',
        speech: json['speech'] as String? ?? json['reply'] as String? ?? '',
        action: AssistantAction.fromJson(json['action'] as Map<String, dynamic>?),
        places: ((json['places'] as List?) ?? const [])
            .map((p) => Place.fromJson(p as Map<String, dynamic>))
            .toList(),
        transcript: json['transcript'] as String?,
      );
}

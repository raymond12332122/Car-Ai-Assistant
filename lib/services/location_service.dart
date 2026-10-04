import 'package:geolocator/geolocator.dart';

import '../models.dart';

class LocationService {
  /// Returns the current position, or null if permission/GPS is unavailable.
  Future<GeoPoint?> current() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) return null;
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) {
        perm = await Geolocator.requestPermission();
      }
      if (perm == LocationPermission.denied ||
          perm == LocationPermission.deniedForever) {
        return null;
      }
      final last = await Geolocator.getLastKnownPosition();
      final pos = (last != null &&
              DateTime.now().difference(last.timestamp).inSeconds < 60)
          ? last
          : await Geolocator.getCurrentPosition(
              locationSettings: const LocationSettings(
                accuracy: LocationAccuracy.high,
                timeLimit: Duration(seconds: 10),
              ),
            );
      return GeoPoint(
        lat: pos.latitude,
        lng: pos.longitude,
        speedKmh: pos.speed >= 0 ? pos.speed * 3.6 : null,
      );
    } catch (_) {
      return null;
    }
  }
}

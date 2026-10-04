import 'package:url_launcher/url_launcher.dart';

/// Opens turn-by-turn navigation. On Android, `google.navigation:` starts
/// Google Maps directly in navigation mode — which also takes over the
/// Android Auto screen when the phone is connected to the car.
class NavigationLauncher {
  static Future<void> navigate(double lat, double lng, {bool waze = false}) async {
    final candidates = waze
        ? [
            Uri.parse('waze://?ll=$lat,$lng&navigate=yes'),
            Uri.parse('https://waze.com/ul?ll=$lat,$lng&navigate=yes'),
          ]
        : [
            Uri.parse('google.navigation:q=$lat,$lng&mode=d'),
            Uri.parse(
                'https://www.google.com/maps/dir/?api=1&destination=$lat,$lng&travelmode=driving'),
          ];
    for (final uri in candidates) {
      if (await launchUrl(uri, mode: LaunchMode.externalApplication)) return;
    }
  }

  static Future<void> call(String phone) =>
      launchUrl(Uri(scheme: 'tel', path: phone));

  /// Opens links clicked inside the web UI (maps, waze, tel) outside the WebView.
  static bool isExternal(Uri uri) {
    const hosts = ['www.google.com', 'maps.google.com', 'google.com', 'waze.com', 'www.waze.com'];
    return uri.scheme == 'tel' ||
        uri.scheme == 'geo' ||
        uri.scheme == 'google.navigation' ||
        uri.scheme == 'waze' ||
        hosts.contains(uri.host);
  }

  static Future<void> openExternal(Uri uri) =>
      launchUrl(uri, mode: LaunchMode.externalApplication);
}

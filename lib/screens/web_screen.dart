import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

import '../config.dart';
import '../services/navigation_launcher.dart';

/// Hosts the Floot web UI in a WebView. Maps / Waze / phone links open in
/// their native apps, and the page can ask the app to speak through the
/// `CopilotoNative` JavaScript channel (Android WebView has no speechSynthesis).
class WebScreen extends StatefulWidget {
  const WebScreen({super.key, required this.onSpeak});

  final Future<void> Function(String text) onSpeak;

  @override
  State<WebScreen> createState() => _WebScreenState();
}

class _WebScreenState extends State<WebScreen> {
  late final WebViewController _controller;
  int _progress = 0;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController(
      // Lets the web page use the microphone (voice input).
      onPermissionRequest: (request) => request.grant(),
    )
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFF0B0F16))
      ..addJavaScriptChannel('CopilotoNative', onMessageReceived: (msg) {
        try {
          final data = jsonDecode(msg.message) as Map<String, dynamic>;
          if (data['type'] == 'speak') widget.onSpeak(data['text'] as String? ?? '');
        } catch (_) {}
      })
      ..setNavigationDelegate(NavigationDelegate(
        onProgress: (p) => setState(() => _progress = p),
        onNavigationRequest: (req) {
          final uri = Uri.parse(req.url);
          if (NavigationLauncher.isExternal(uri)) {
            NavigationLauncher.openExternal(uri);
            return NavigationDecision.prevent;
          }
          return NavigationDecision.navigate;
        },
      ))
      ..loadRequest(Uri.parse(AppConfig.backendUrl));

    final platform = _controller.platform;
    if (platform is AndroidWebViewController) {
      platform.setGeolocationPermissionsPromptCallbacks(
        onShowPrompt: (_) async =>
            const GeolocationPermissionsResponse(allow: true, retain: true),
      );
      platform.setMediaPlaybackRequiresUserGesture(false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        WebViewWidget(controller: _controller),
        if (_progress < 100) LinearProgressIndicator(value: _progress / 100),
      ],
    );
  }
}

/// App-wide configuration.
///
/// The backend runs on Floot (serverless endpoints + hosted web UI). Override
/// at build time with `--dart-define=BACKEND_URL=https://...`.
class AppConfig {
  static const backendUrl = String.fromEnvironment(
    'BACKEND_URL',
    defaultValue: 'https://copiloto-car-ai.floot.app',
  );

  static const language = String.fromEnvironment(
    'ASSISTANT_LANGUAGE',
    defaultValue: 'es-MX',
  );

  /// Messages kept as conversation context for the assistant.
  static const maxHistory = 12;
}

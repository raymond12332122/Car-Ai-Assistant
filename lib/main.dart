import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'screens/assistant_screen.dart';
import 'screens/web_screen.dart';
import 'services/assistant_controller.dart';
import 'theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: CopilotoColors.background,
    systemNavigationBarColor: CopilotoColors.background,
  ));
  runApp(const CopilotoApp());
}

class CopilotoApp extends StatefulWidget {
  const CopilotoApp({super.key});

  @override
  State<CopilotoApp> createState() => _CopilotoAppState();
}

class _CopilotoAppState extends State<CopilotoApp> {
  final controller = AssistantController();
  int tab = 0;

  @override
  void initState() {
    super.initState();
    controller.init();
  }

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Copiloto',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(),
      home: Scaffold(
        body: SafeArea(
          child: IndexedStack(
            index: tab,
            children: [
              AssistantScreen(controller: controller),
              WebScreen(onSpeak: controller.speak),
            ],
          ),
        ),
        bottomNavigationBar: NavigationBar(
          selectedIndex: tab,
          onDestinationSelected: (i) => setState(() => tab = i),
          backgroundColor: CopilotoColors.surface,
          destinations: const [
            NavigationDestination(icon: Icon(Icons.mic_none), selectedIcon: Icon(Icons.mic), label: 'Copiloto'),
            NavigationDestination(icon: Icon(Icons.public), label: 'Web'),
          ],
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';

import '../services/assistant_controller.dart';
import '../services/navigation_launcher.dart';
import '../theme.dart';
import '../widgets/place_card.dart';

class _QuickAction {
  const _QuickAction(this.label, this.icon, this.prompt);
  final String label;
  final IconData icon;
  final String prompt;
}

const _quickActions = [
  _QuickAction('Gasolina', Icons.local_gas_station, 'Busca la gasolinera más cercana'),
  _QuickAction('Cargador', Icons.ev_station, 'Busca un cargador para auto eléctrico cerca'),
  _QuickAction('Comida', Icons.restaurant, '¿Dónde puedo comer cerca?'),
  _QuickAction('Estacionar', Icons.local_parking, 'Busca estacionamiento cerca'),
  _QuickAction('Taller', Icons.build, 'Busca un taller mecánico cercano'),
  _QuickAction('Hospital', Icons.local_hospital, '¿Cuál es el hospital más cercano?'),
  _QuickAction('Clima', Icons.wb_cloudy, '¿Cómo está el clima aquí hoy?'),
  _QuickAction('Tráfico', Icons.traffic, '¿Hay tráfico o incidentes cerca de mí?'),
];

class AssistantScreen extends StatefulWidget {
  const AssistantScreen({super.key, required this.controller});

  final AssistantController controller;

  @override
  State<AssistantScreen> createState() => _AssistantScreenState();
}

class _AssistantScreenState extends State<AssistantScreen> {
  final _text = TextEditingController();

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  String _statusLabel(AssistantStatus s) => switch (s) {
        AssistantStatus.idle => 'TOCA EL MICRÓFONO Y HABLA',
        AssistantStatus.listening => 'ESCUCHANDO…',
        AssistantStatus.thinking => 'PENSANDO…',
        AssistantStatus.speaking => 'RESPONDIENDO',
        AssistantStatus.error => 'HUBO UN PROBLEMA',
      };

  @override
  Widget build(BuildContext context) {
    final c = widget.controller;
    return ListenableBuilder(
      listenable: c,
      builder: (context, _) {
        final reply = c.lastReply;
        final busy = c.status == AssistantStatus.thinking;
        final listening = c.status == AssistantStatus.listening;
        return Column(
          children: [
            _Header(controller: c),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                children: [
                  Text(_statusLabel(c.status),
                      style: TextStyle(
                        letterSpacing: 1.2,
                        fontWeight: FontWeight.w600,
                        color: listening || c.status == AssistantStatus.speaking
                            ? CopilotoColors.primary
                            : c.status == AssistantStatus.error
                                ? CopilotoColors.warning
                                : CopilotoColors.muted,
                      )),
                  const SizedBox(height: 10),
                  if (c.transcript != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Text('“${c.transcript}”',
                          style: const TextStyle(
                              fontSize: 18,
                              fontStyle: FontStyle.italic,
                              color: CopilotoColors.muted)),
                    ),
                  if (c.error != null)
                    Text(c.error!,
                        style: const TextStyle(fontSize: 22, color: CopilotoColors.warning))
                  else if (reply != null)
                    Text(reply.reply, style: Theme.of(context).textTheme.headlineMedium)
                  else ...[
                    Text('¿A dónde vamos hoy?',
                        style: Theme.of(context).textTheme.headlineMedium),
                    const SizedBox(height: 8),
                    const Text(
                        'Pregúntame por gasolineras, comida, clima o dime “llévame a…”.',
                        style: TextStyle(fontSize: 18, color: CopilotoColors.muted)),
                  ],
                  if (reply != null && reply.action.canNavigate) ...[
                    const SizedBox(height: 16),
                    _NavigateCard(
                      name: reply.action.destinationName ?? 'Destino',
                      address: reply.action.address,
                      lat: reply.action.lat!,
                      lng: reply.action.lng!,
                    ),
                  ],
                  if (reply != null && reply.action.type == 'call' && reply.action.phone != null) ...[
                    const SizedBox(height: 16),
                    FilledButton.icon(
                      onPressed: () => NavigationLauncher.call(reply.action.phone!),
                      icon: const Icon(Icons.phone),
                      label: Text('Llamar ${reply.action.destinationName ?? ''}'),
                    ),
                  ],
                  if (reply != null && reply.places.isNotEmpty && !reply.action.canNavigate) ...[
                    const SizedBox(height: 16),
                    SizedBox(
                      height: 190,
                      child: ListView.separated(
                        scrollDirection: Axis.horizontal,
                        itemCount: reply.places.length,
                        separatorBuilder: (_, _) => const SizedBox(width: 12),
                        itemBuilder: (_, i) =>
                            PlaceCard(place: reply.places[i], highlighted: i == 0),
                      ),
                    ),
                  ],
                  const SizedBox(height: 24),
                  GridView.count(
                    crossAxisCount: 4,
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    mainAxisSpacing: 10,
                    crossAxisSpacing: 10,
                    childAspectRatio: 0.95,
                    children: [
                      for (final a in _quickActions)
                        _QuickButton(
                          action: a,
                          enabled: !busy,
                          onTap: () => c.ask(a.prompt),
                        ),
                    ],
                  ),
                  const SizedBox(height: 16),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _text,
                      style: const TextStyle(fontSize: 18),
                      textInputAction: TextInputAction.send,
                      onSubmitted: (v) {
                        c.ask(v);
                        _text.clear();
                      },
                      decoration: InputDecoration(
                        hintText: 'Escribe (solo estacionado)…',
                        filled: true,
                        fillColor: CopilotoColors.surface,
                        border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(18),
                            borderSide: const BorderSide(color: CopilotoColors.border)),
                      ),
                    ),
                  ),
                  const SizedBox(width: 14),
                  _MicButton(
                    listening: listening,
                    busy: busy,
                    onTap: c.listen,
                  ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.controller});
  final AssistantController controller;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 8, 8),
      child: Row(
        children: [
          Container(
            width: 14,
            height: 14,
            decoration: const BoxDecoration(
              color: CopilotoColors.primary,
              shape: BoxShape.circle,
              boxShadow: [BoxShadow(color: Color(0x662EE6F6), blurRadius: 12, spreadRadius: 2)],
            ),
          ),
          const SizedBox(width: 10),
          const Text('Copiloto', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
          const Spacer(),
          _ModelChip(controller: controller),
          IconButton(
            iconSize: 30,
            tooltip: controller.voiceEnabled ? 'Silenciar voz' : 'Activar voz',
            onPressed: controller.toggleVoice,
            icon: Icon(controller.voiceEnabled ? Icons.volume_up : Icons.volume_off),
          ),
          IconButton(
            iconSize: 30,
            tooltip: 'Nueva conversación',
            onPressed: controller.clear,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
    );
  }
}

class _ModelChip extends StatelessWidget {
  const _ModelChip({required this.controller});
  final AssistantController controller;

  String _shortLabel() {
    final id = controller.activeModel;
    final match = controller.catalog?.models.where((m) => m.id == id);
    if (match == null || match.isEmpty) return id ?? 'Sin modelo';
    return match.first.label.replaceFirst('ChatGPT · ', '');
  }

  @override
  Widget build(BuildContext context) {
    final hasModel = controller.activeModel != null;
    return ActionChip(
      avatar: Icon(Icons.auto_awesome,
          size: 18, color: hasModel ? CopilotoColors.primary : CopilotoColors.warning),
      label: Text(_shortLabel(), style: const TextStyle(fontSize: 14)),
      onPressed: () => _openPicker(context),
    );
  }

  Future<void> _openPicker(BuildContext context) async {
    await controller.refreshModels();
    if (!context.mounted) return;
    final catalog = controller.catalog;
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: CopilotoColors.surface,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(20, 0, 20, 8),
              child: Text('Modelo de IA',
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
            ),
            if (catalog == null)
              const ListTile(title: Text('No se pudo cargar la lista. Revisa tu conexión.'))
            else ...[
              for (final m in catalog.models)
                ListTile(
                  enabled: m.available,
                  minTileHeight: 64,
                  leading: Icon(
                    m.provider == 'anthropic' ? Icons.auto_awesome : Icons.chat_bubble_outline,
                    color: m.available ? CopilotoColors.primary : CopilotoColors.muted,
                  ),
                  title: Text(m.label, style: const TextStyle(fontSize: 18)),
                  subtitle: Text(m.available ? m.note : 'Falta conectar la llave de API'),
                  trailing: m.id == controller.activeModel
                      ? const Icon(Icons.check, color: CopilotoColors.primary)
                      : null,
                  onTap: () {
                    controller.selectModel(m.id);
                    Navigator.pop(ctx);
                  },
                ),
              if (!catalog.voiceAvailable)
                const Padding(
                  padding: EdgeInsets.fromLTRB(20, 8, 20, 16),
                  child: Text(
                    'La voz desde el micrófono del auto (Android Auto) necesita la llave de OpenAI para transcribir.',
                    style: TextStyle(color: CopilotoColors.muted),
                  ),
                ),
            ],
          ],
        ),
      ),
    );
  }
}

class _QuickButton extends StatelessWidget {
  const _QuickButton({required this.action, required this.enabled, required this.onTap});
  final _QuickAction action;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: CopilotoColors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: const BorderSide(color: CopilotoColors.border),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: enabled ? onTap : null,
        child: Opacity(
          opacity: enabled ? 1 : 0.5,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(action.icon, size: 30, color: CopilotoColors.primary),
              const SizedBox(height: 6),
              Text(action.label,
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
            ],
          ),
        ),
      ),
    );
  }
}

class _MicButton extends StatelessWidget {
  const _MicButton({required this.listening, required this.busy, required this.onTap});
  final bool listening;
  final bool busy;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: listening ? 'Terminar de hablar' : 'Hablar con Copiloto',
      child: GestureDetector(
        onTap: busy ? null : onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 300),
          width: 96,
          height: 96,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: CopilotoColors.primary,
            boxShadow: [
              BoxShadow(
                color: const Color(0x662EE6F6),
                blurRadius: listening ? 36 : 22,
                spreadRadius: listening ? 8 : 1,
              ),
            ],
          ),
          child: Center(
            child: busy
                ? const SizedBox(
                    width: 36,
                    height: 36,
                    child: CircularProgressIndicator(
                        strokeWidth: 4, color: CopilotoColors.onPrimary))
                : Icon(listening ? Icons.stop : Icons.mic,
                    size: 46, color: CopilotoColors.onPrimary),
          ),
        ),
      ),
    );
  }
}

class _NavigateCard extends StatelessWidget {
  const _NavigateCard({required this.name, this.address, required this.lat, required this.lng});
  final String name;
  final String? address;
  final double lat;
  final double lng;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: CopilotoColors.card,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: CopilotoColors.primary),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('DESTINO',
              style: TextStyle(color: CopilotoColors.muted, letterSpacing: 1.2)),
          const SizedBox(height: 4),
          Text(name, style: Theme.of(context).textTheme.titleLarge),
          if (address != null)
            Text(address!,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: CopilotoColors.muted)),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: FilledButton.icon(
                  onPressed: () => NavigationLauncher.navigate(lat, lng),
                  icon: const Icon(Icons.navigation),
                  label: const Text('Iniciar navegación'),
                ),
              ),
              const SizedBox(width: 8),
              FilledButton.tonal(
                onPressed: () => NavigationLauncher.navigate(lat, lng, waze: true),
                child: const Text('Waze'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

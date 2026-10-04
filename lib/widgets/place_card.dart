import 'package:flutter/material.dart';

import '../models.dart';
import '../services/navigation_launcher.dart';
import '../theme.dart';

class PlaceCard extends StatelessWidget {
  const PlaceCard({super.key, required this.place, this.highlighted = false});

  final Place place;
  final bool highlighted;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 290,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: CopilotoColors.card,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(
          color: highlighted ? CopilotoColors.primary : CopilotoColors.border,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(place.name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.titleLarge),
              ),
              const SizedBox(width: 8),
              Text(place.distanceLabel,
                  style: const TextStyle(
                      color: CopilotoColors.primary,
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                      fontFeatures: [FontFeature.tabularFigures()])),
            ],
          ),
          if (place.address != null) ...[
            const SizedBox(height: 4),
            Text(place.address!,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: CopilotoColors.muted, fontSize: 15)),
          ],
          const Spacer(),
          Row(
            children: [
              Expanded(
                child: FilledButton.icon(
                  onPressed: () => NavigationLauncher.navigate(place.lat, place.lng),
                  icon: const Icon(Icons.navigation),
                  label: const Text('Navegar'),
                ),
              ),
              const SizedBox(width: 8),
              FilledButton.tonal(
                onPressed: () => NavigationLauncher.navigate(place.lat, place.lng, waze: true),
                child: const Text('Waze'),
              ),
              if (place.phone != null) ...[
                const SizedBox(width: 8),
                IconButton.filledTonal(
                  iconSize: 28,
                  onPressed: () => NavigationLauncher.call(place.phone!),
                  icon: const Icon(Icons.phone),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

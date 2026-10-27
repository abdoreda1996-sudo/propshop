import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../services/api.dart';

import '../models/home.dart';
import '../services/format.dart';
import '../services/lang.dart';
import '../theme/tokens.dart';

/// Browse pieces for the discover screen: a section heading, compound tiles and the
/// area index. Nothing here is an action colour; these are all navigation.

/// "الكمبوندات / الأكتر وحدات الأول ............ الكل"
class SectionHead extends StatelessWidget {
  const SectionHead({
    super.key,
    required this.title,
    this.count,
    this.onMore,
    this.moreLabel,
  });

  final String title;
  final String? count;
  final VoidCallback? onMore;
  final String? moreLabel;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                title,
                style: const TextStyle(
                  fontSize: 20,
                  height: 1.2,
                  fontWeight: FontWeight.w700,
                  color: AqarColors.heading,
                ),
              ),
              if (count != null)
                Padding(
                  padding: const EdgeInsets.only(top: 3),
                  child: Text(
                    count!,
                    style: const TextStyle(fontSize: 12.5, color: AqarColors.textMuted),
                  ),
                ),
            ],
          ),
        ),
        if (onMore != null && moreLabel != null)
          TextButton(
            onPressed: onMore,
            style: TextButton.styleFrom(
              foregroundColor: AqarColors.brand500,
              padding: const EdgeInsets.symmetric(horizontal: 6),
              minimumSize: const Size(0, 36),
            ),
            child: Text(
              moreLabel!,
              style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600),
            ),
          ),
      ],
    );
  }
}

/// A compound: its cover photo, then the name and one line of facts under it. The text
/// sits below the photo rather than over a dark gradient.
class CompoundTile extends StatelessWidget {
  const CompoundTile({super.key, required this.compound, required this.onTap});

  final HomeCompound compound;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 200,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AqarRadius.tile),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(AqarRadius.tile),
              child: SizedBox(
                height: 128,
                width: 200,
                child: compound.cover != null
                    ? CachedNetworkImage(
                        imageUrl: absoluteMediaUrl(compound.cover!),
                        fit: BoxFit.cover,
                        placeholder: (_, __) => Container(color: AqarColors.navy100),
                        errorWidget: (_, __, ___) => Container(color: AqarColors.navy100),
                      )
                    : Container(color: AqarColors.navy100),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              compound.name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 14, height: 1.3, fontWeight: FontWeight.w700, color: AqarColors.ink900),
            ),
            const SizedBox(height: 2),
            Text(
              compound.area,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 12, height: 1.35, color: AqarColors.ink500),
            ),
            Text(
              !isEn && compound.units == 2 ? unitsLabel(2) : '${formatNumber(compound.units)} ${unitsLabel(compound.units)}',
              style: const TextStyle(fontSize: 12, height: 1.35, color: AqarColors.ink500, fontFeatures: AqarType.tnum),
            ),
          ],
        ),
      ),
    );
  }
}

/// One line of the area index: name on the start side, unit count on the end.
class AreaRow extends StatelessWidget {
  const AreaRow({super.key, required this.area, required this.onTap});

  final HomeArea area;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: const BoxDecoration(
          border: Border(bottom: BorderSide(color: AqarColors.border)),
        ),
        child: Row(
          children: [
            Expanded(
              child: Text(
                area.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: AqarColors.ink900),
              ),
            ),
            const SizedBox(width: 6),
            Text(
              formatNumber(area.units),
              style: const TextStyle(fontSize: 13, color: AqarColors.ink400, fontFeatures: AqarType.tnum),
            ),
          ],
        ),
      ),
    );
  }
}

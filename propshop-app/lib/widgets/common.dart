import 'package:flutter/material.dart';
import '../services/lang.dart';
import '../theme/tokens.dart';

/// Trust signals and price verdicts, matching the web components one for one.

class AqarBadge extends StatelessWidget {
  const AqarBadge({
    super.key,
    required this.label,
    this.icon,
    this.background,
    this.foreground,
    this.borderColor,
  });

  final String label;

  /// Only the Verified mark keeps its shield: it is a status people learn to look for.
  /// Every other badge is text alone (2026-10-26).
  final IconData? icon;
  final Color? background;
  final Color? foreground;
  final Color? borderColor;

  factory AqarBadge.verified(String label, {IconData? icon}) => AqarBadge(
    label: label,
    icon: icon == null || icon == Icons.verified_user_outlined ? Icons.verified_user_outlined : null,
    background: AqarColors.accent50,
    foreground: AqarColors.accent600,
  );

  factory AqarBadge.owner(String label) => AqarBadge(
    label: label,
    background: AqarColors.ink50,
    foreground: AqarColors.ink900,
  );

  factory AqarBadge.danger(String label, {IconData? icon}) => AqarBadge(
    label: label,
    background: AqarColors.dangerBg,
    foreground: AqarColors.danger,
  );

  factory AqarBadge.neutral(String label, {IconData? icon}) => AqarBadge(
    label: label,
    background: AqarColors.ink100,
    foreground: AqarColors.ink700,
  );

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: background ?? AqarColors.ink100,
        borderRadius: BorderRadius.circular(3),
        border: borderColor == null ? null : Border.all(color: borderColor!),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 11, color: foreground ?? AqarColors.textMuted),
            const SizedBox(width: 3),
          ],
          // Flexible: a badge sits inside narrow columns (the 132px photo rail, a chip
          // row on a 390px phone) and must ellipsise rather than overflow the layout.
          Flexible(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 11,
                height: 1.35,
                fontWeight: FontWeight.w600,
                color: foreground ?? AqarColors.textMuted,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// An attribute as plain text, "الاستلام استلام فوري". It used to be a grey box; in a
/// row of facts a box per fact is noise.
class AqarChip extends StatelessWidget {
  const AqarChip({super.key, required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Text.rich(
      TextSpan(
        children: [
          TextSpan(text: '$label '),
          TextSpan(
            text: value,
            style: const TextStyle(fontWeight: FontWeight.w600, color: AqarColors.ink900),
          ),
        ],
      ),
      style: const TextStyle(fontSize: 12, color: AqarColors.ink500),
    );
  }
}

/// "Below / above / within fair price", the core buyer-side hook (Section 6b-A).
class PriceVerdictBadge extends StatelessWidget {
  const PriceVerdictBadge({super.key, required this.verdict});
  final String verdict;

  @override
  Widget build(BuildContext context) {
    switch (verdict) {
      case 'below':
        return AqarBadge(
          label: tr('أقل من السعر العادل', 'Below fair price'),
          background: AqarColors.ok50,
          foreground: AqarColors.ok700,
        );
      case 'above':
        return AqarBadge.danger(tr('أعلى من السعر العادل', 'Above fair price'));
      case 'fair':
        return AqarBadge.neutral(tr('في نطاق السعر العادل', 'Within fair price'));
      default:
        return const SizedBox.shrink();
    }
  }
}

/// An empty or error screen: a short heading and a sentence, start-aligned like the rest
/// of the app, with the next step under it. No big grey icon.
class EmptyState extends StatelessWidget {
  const EmptyState({
    super.key,
    required this.title,
    this.body,
    this.icon,
    this.action,
  });

  final String title;
  final String? body;

  /// Accepted for older call sites; no longer drawn.
  final IconData? icon;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: const AlignmentDirectional(-1, -0.4),
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(
                  fontSize: 18,
                  height: 1.3,
                  fontWeight: FontWeight.w700,
                  color: AqarColors.ink900,
                ),
              ),
              if (body != null) ...[
                const SizedBox(height: 6),
                Text(
                  body!,
                  style: const TextStyle(
                    fontSize: 14,
                    height: 1.6,
                    color: AqarColors.ink500,
                  ),
                ),
              ],
              if (action != null) ...[const SizedBox(height: 18), action!],
            ],
          ),
        ),
      ),
    );
  }
}

class ErrorNotice extends StatelessWidget {
  const ErrorNotice({super.key, required this.message, this.onRetry});
  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    return EmptyState(
      title: tr('مش قادرين نوصل للسيرفر', "We can't reach the server"),
      body: message,
      action: onRetry == null
          ? null
          : OutlinedButton(
              onPressed: onRetry,
              child: Text(tr('حاول تاني', 'Try again')),
            ),
    );
  }
}

/// The no-cold-call promise, restated wherever a buyer is about to act. A rule on the
/// leading edge instead of a tinted box with an icon.
class ContactPolicyNote extends StatelessWidget {
  const ContactPolicyNote({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsetsDirectional.only(start: 12, top: 2, bottom: 2),
      decoration: const BoxDecoration(
        border: BorderDirectional(start: BorderSide(color: AqarColors.ink200, width: 2)),
      ),
      child: Text(
        tr(
          'الوحدة دي من المالك مباشرة. الأسماء والأرقام مابتظهرش لأي طرف قبل تأكيد المعاينة.',
          'This unit is offered by its owner directly. Names and numbers stay hidden from both sides until a viewing is confirmed.',
        ),
        style: const TextStyle(
          fontSize: 12.5,
          height: 1.6,
          color: AqarColors.ink700,
        ),
      ),
    );
  }
}

/// A plain section heading inside a screen: one size, start-aligned, no icon and no
/// eyebrow above it. Use instead of a bold Text with an Icon beside it.
class SectionTitle extends StatelessWidget {
  const SectionTitle(this.text, {super.key, this.trailing, this.padding = const EdgeInsets.only(bottom: 8)});
  final String text;
  final Widget? trailing;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: padding,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Expanded(
            child: Text(
              text,
              style: const TextStyle(fontSize: 16, height: 1.3, fontWeight: FontWeight.w700, color: AqarColors.ink900),
            ),
          ),
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}

/// One row of a plain settings-style list: label (and optional detail) on the start
/// side, a count or chevron on the end, a hairline under it. Replaces stacks of
/// full-width outlined buttons with an icon each.
class PlainRow extends StatelessWidget {
  const PlainRow({
    super.key,
    required this.label,
    this.detail,
    this.trailing,
    this.onTap,
    this.color,
    this.divider = true,
  });
  final String label;
  final String? detail;
  final Widget? trailing;
  final VoidCallback? onTap;
  final Color? color;
  final bool divider;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Container(
        constraints: const BoxConstraints(minHeight: 52),
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: divider
            ? const BoxDecoration(border: Border(bottom: BorderSide(color: AqarColors.border)))
            : null,
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    label,
                    style: TextStyle(fontSize: 15, height: 1.3, fontWeight: FontWeight.w500, color: color ?? AqarColors.ink900),
                  ),
                  if (detail != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(detail!, style: const TextStyle(fontSize: 12.5, height: 1.4, color: AqarColors.ink500)),
                    ),
                ],
              ),
            ),
            if (trailing != null) trailing!,
            if (onTap != null && trailing == null)
              Icon(isEn ? Icons.chevron_right : Icons.chevron_left, size: 18, color: AqarColors.ink400),
          ],
        ),
      ),
    );
  }
}

/// A count beside a row label ("3"), rust when something waits on the user.
class CountTag extends StatelessWidget {
  const CountTag(this.n, {super.key, this.urgent = false});
  final int n;
  final bool urgent;

  @override
  Widget build(BuildContext context) {
    if (n <= 0) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsetsDirectional.only(end: 6),
      child: Text(
        '$n',
        style: AqarType.figure(size: 13, weight: FontWeight.w700, color: urgent ? AqarColors.accent600 : AqarColors.ink500),
      ),
    );
  }
}

/// The fair-price band with the asking price marked on it, as on the website.
///
/// Alignment is expressed with [Alignment] inside a [Directionality]-aware [Align] so
/// the marker sits at the correct end under RTL without any manual mirroring: -1 is the
/// start of the reading direction, +1 the end.
class FairPriceBand extends StatelessWidget {
  const FairPriceBand({
    super.key,
    required this.asking,
    required this.low,
    required this.high,
  });

  final double asking;
  final double low;
  final double high;

  @override
  Widget build(BuildContext context) {
    final span = (high - low).abs() < 1 ? 1.0 : high - low;
    final t = ((asking - low) / span).clamp(0.0, 1.0);
    final rtl = Directionality.of(context) == TextDirection.rtl;
    // Alignment.x runs left(-1) to right(+1) regardless of direction, so mirror in RTL.
    final x = (rtl ? 1 - t : t) * 2 - 1;

    return SizedBox(
      height: 14,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Container(
            height: 6,
            decoration: BoxDecoration(
              color: AqarColors.ok50,
              borderRadius: BorderRadius.circular(999),
            ),
          ),
          Align(
            alignment: Alignment(x.toDouble(), 0),
            child: Container(
              width: 3,
              height: 14,
              decoration: BoxDecoration(
                color: AqarColors.ink900,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

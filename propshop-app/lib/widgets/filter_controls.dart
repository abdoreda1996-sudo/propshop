import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../services/format.dart';
import '../services/lang.dart';
import '../theme/tokens.dart';

/// The browse filters' building blocks, shared by the search panels and the trade-request
/// form — the website uses the same controls for both (FilterBar.tsx, TradeRequestForm.tsx),
/// so "what the form says" and "what the filters would find" never disagree.

/* ── Names ──────────────────────────────────────────────────────────────── */

/// Loose name match for suggestions, as the website's `normalise()`: case, Arabic
/// alef/yaa/taa-marbuta forms and spacing do not matter, so "ميفيدا", "mivida" and
/// "Mi Vida" all find the same compound.
String normaliseName(String s) => s
    .toLowerCase()
    .replaceAll(RegExp('[أإآ]'), 'ا')
    .replaceAll('ى', 'ي')
    .replaceAll('ة', 'ه')
    .replaceAll(RegExp(r"[\s\-_'’.]"), '');

/// True when [query] is empty or found in either name.
bool nameMatches(String query, String ar, String en) {
  final n = normaliseName(query);
  return n.isEmpty || normaliseName(ar).contains(n) || normaliseName(en).contains(n);
}

/// An area or a compound, from GET /api/compounds. Search filters by [slug]; trade
/// requests store [id]s.
class Place {
  const Place({
    required this.kind,
    required this.id,
    required this.slug,
    required this.nameAr,
    required this.nameEn,
    this.areaId,
  });

  /// 'area' | 'compound'
  final String kind;
  final String id;
  final String slug;
  final String nameAr;
  final String nameEn;

  /// A compound's area.
  final String? areaId;

  bool get isCompound => kind == 'compound';
  String get name => isEn && nameEn.isNotEmpty ? nameEn : nameAr;
  bool matches(String query) => nameMatches(query, nameAr, nameEn);
}

/// Areas (deduped, in first-seen order) and compounds from the /api/compounds payload.
({List<Place> areas, List<Place> compounds}) placesFromCompounds(List<Map<String, dynamic>> raw) {
  final areas = <String, Place>{};
  final compounds = <Place>[];
  for (final c in raw) {
    final a = c['area'] as Map<String, dynamic>?;
    final areaId = (c['areaId'] ?? '') as String;
    if (a != null) {
      final slug = (a['slug'] ?? '') as String;
      areas.putIfAbsent(
        slug,
        () => Place(kind: 'area', id: areaId, slug: slug, nameAr: (a['nameAr'] ?? '') as String, nameEn: (a['nameEn'] ?? '') as String),
      );
    }
    compounds.add(Place(
      kind: 'compound',
      id: (c['id'] ?? '') as String,
      slug: (c['slug'] ?? '') as String,
      nameAr: (c['nameAr'] ?? '') as String,
      nameEn: (c['nameEn'] ?? '') as String,
      areaId: areaId,
    ));
  }
  return (areas: areas.values.toList(), compounds: compounds);
}

/// Names that START with the query first, then names that contain it.
List<Place> rankPlaces(Iterable<Place> places, String query, int take) {
  final n = normaliseName(query);
  if (n.isEmpty) return const [];
  final prefix = <Place>[], contains = <Place>[];
  for (final p in places) {
    final ar = normaliseName(p.nameAr), en = normaliseName(p.nameEn);
    if (ar.startsWith(n) || en.startsWith(n)) {
      prefix.add(p);
    } else if (ar.contains(n) || en.contains(n)) {
      contains.add(p);
    }
  }
  return [...prefix, ...contains].take(take).toList();
}

/* ── Options ────────────────────────────────────────────────────────────── */

/// Property types in the owner's sections (web enums.ts UNIT_TYPE_GROUPS). Chalet is
/// deliberately in no group: still a valid stored type, but not on the owner's list.
const List<({String key, String ar, String en, List<String> types})> unitTypeGroups = [
  (key: 'villas', ar: 'فيلات', en: 'Villas', types: ['townhouse', 'twinhouse', 'villa']),
  (key: 'apartments', ar: 'شقق', en: 'Apartments', types: ['studio', 'apartment', 'duplex', 'ground_apartment', 'penthouse']),
  (key: 'commercial', ar: 'تجاري', en: 'Commercial', types: ['office', 'retail']),
];

/// Bedrooms and bathrooms, as the website's facets (facets.ts BEDROOM_OPTIONS /
/// BATHROOM_OPTIONS): exact counts, the last one meaning "or more". The pill labels are
/// FilterBar's PILL_LABELS — short enough to keep every option on one row.
typedef RoomOption = ({String value, String pillAr, String pillEn, String ar, String en});

const List<RoomOption> bedOptions = [
  (value: '0', pillAr: 'استوديو', pillEn: 'Studio', ar: 'استوديو', en: 'Studio'),
  (value: '1', pillAr: '١', pillEn: '1', ar: 'غرفة', en: '1 bed'),
  (value: '2', pillAr: '٢', pillEn: '2', ar: 'غرفتين', en: '2 beds'),
  (value: '3', pillAr: '٣', pillEn: '3', ar: '٣ غرف', en: '3 beds'),
  (value: '4', pillAr: '٤', pillEn: '4', ar: '٤ غرف', en: '4 beds'),
  (value: '5', pillAr: '+٥', pillEn: '5+', ar: '٥ غرف أو أكثر', en: '5+ beds'),
];

const List<RoomOption> bathOptions = [
  (value: '1', pillAr: '١', pillEn: '1', ar: 'حمام', en: '1 bath'),
  (value: '2', pillAr: '٢', pillEn: '2', ar: 'حمامين', en: '2 baths'),
  (value: '3', pillAr: '٣', pillEn: '3', ar: '٣ حمامات', en: '3 baths'),
  (value: '4', pillAr: '+٤', pillEn: '4+', ar: '٤ حمامات أو أكثر', en: '4+ baths'),
];

String roomOptionLabel(List<RoomOption> options, String value) {
  for (final o in options) {
    if (o.value == value) return tr(o.ar, o.en);
  }
  return value;
}

/// Cash vs instalments in the Price panel (FilterBar PAYMENT_CHOICES). "Installments"
/// also covers resale-with-instalments, so it sends both values.
const List<({String key, List<String> values, String ar, String en})> paymentChoices = [
  (key: 'cash', values: ['cash'], ar: 'كاش', en: 'Cash'),
  (key: 'installments', values: ['installments', 'resale_installments'], ar: 'تقسيط', en: 'Installments'),
];

/// Every payment type, labelled as the website's payment facet (facets.ts PAYMENT_LABELS).
const List<({String value, String ar, String en})> paymentOptions = [
  (value: 'cash', ar: 'كاش', en: 'Cash'),
  (value: 'installments', ar: 'تقسيط', en: 'Instalments'),
  (value: 'resale_installments', ar: 'ريسيل بأقساط', en: 'Resale with instalments'),
];

/// Ticks or unticks [value] in a multi-select group.
List<String> flipValue(List<String> cur, String value) =>
    cur.contains(value) ? [for (final v in cur) if (v != value) v] : [...cur, value];

/* ── Widgets ────────────────────────────────────────────────────────────── */

class FilterLegend extends StatelessWidget {
  const FilterLegend(this.text, {super.key, this.trailing});
  final String text;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Row(
          children: [
            Expanded(
              child: Text(text, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AqarColors.ink900)),
            ),
            if (trailing != null) trailing!,
          ],
        ),
      );
}

/// One tickable row: an 18px checkbox and its label.
class FilterCheckRow extends StatelessWidget {
  const FilterCheckRow({super.key, required this.label, required this.value, required this.onTap});
  final String label;
  final bool value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => InkWell(
        borderRadius: BorderRadius.circular(6),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Row(
            children: [
              SizedBox(
                width: 20,
                height: 20,
                child: Checkbox(
                  value: value,
                  activeColor: AqarColors.brand500,
                  materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  visualDensity: VisualDensity.compact,
                  side: const BorderSide(color: AqarColors.navy300, width: 1.5),
                  onChanged: (_) => onTap(),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 14, color: AqarColors.ink900)),
              ),
            ],
          ),
        ),
      );
}

/// Rows in two columns.
class TwoColumns extends StatelessWidget {
  const TwoColumns({super.key, required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
        builder: (context, c) {
          final w = (c.maxWidth - 12) / 2;
          return Wrap(spacing: 12, children: [for (final ch in children) SizedBox(width: w, child: ch)]);
        },
      );
}

/// Zillow's joined pill row (Any | 1 | 2 | …), multi-select to match the facets. "Any"
/// clears the group. One row of equal cells; the short labels are what make them fit.
class RoomPillRow extends StatelessWidget {
  const RoomPillRow({super.key, required this.title, required this.options, required this.picked, required this.onChanged});

  final String title;
  final List<RoomOption> options;
  final List<String> picked;
  final ValueChanged<List<String>> onChanged;

  @override
  Widget build(BuildContext context) {
    final pills = <(String?, String)>[
      (null, tr('الكل', 'Any')),
      for (final o in options) (o.value, tr(o.pillAr, o.pillEn)),
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        FilterLegend(title),
        Container(
          height: 40,
          decoration: BoxDecoration(
            border: Border.all(color: AqarColors.navy300),
            borderRadius: BorderRadius.circular(AqarRadius.control),
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(AqarRadius.control - 1),
            child: Row(
              children: [
                for (var i = 0; i < pills.length; i++) ...[
                  if (i > 0) const VerticalDivider(width: 1, thickness: 1, color: AqarColors.navy300),
                  Expanded(
                    child: _pill(
                      pills[i].$2,
                      pills[i].$1 == null ? picked.isEmpty : picked.contains(pills[i].$1),
                      () => onChanged(pills[i].$1 == null ? const [] : flipValue(picked, pills[i].$1!)),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _pill(String text, bool on, VoidCallback onTap) => Material(
        color: on ? AqarColors.brand50 : Colors.white,
        child: InkWell(
          onTap: onTap,
          child: Container(
            alignment: Alignment.center,
            foregroundDecoration: on ? BoxDecoration(border: Border.all(color: AqarColors.brand500, width: 2)) : null,
            padding: const EdgeInsets.symmetric(horizontal: 2),
            child: FittedBox(
              fit: BoxFit.scaleDown,
              child: Text(
                text,
                maxLines: 1,
                softWrap: false,
                style: TextStyle(fontSize: 13, fontWeight: on ? FontWeight.w700 : FontWeight.w500, color: AqarColors.ink900),
              ),
            ),
          ),
        ),
      );
}

/// Property type in the owner's sections (Villas / Apartments / Commercial), each with an
/// All / Clear switch for the whole group.
class UnitTypeSections extends StatelessWidget {
  const UnitTypeSections({super.key, required this.picked, required this.onChanged, this.spacing = 16});

  final List<String> picked;
  final ValueChanged<List<String>> onChanged;
  final double spacing;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (var gi = 0; gi < unitTypeGroups.length; gi++) ...[
          if (gi > 0) SizedBox(height: spacing),
          Builder(builder: (context) {
            final g = unitTypeGroups[gi];
            final all = g.types.every(picked.contains);
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                FilterLegend(
                  tr(g.ar, g.en),
                  trailing: InkWell(
                    borderRadius: BorderRadius.circular(6),
                    onTap: () {
                      final rest = [for (final t in picked) if (!g.types.contains(t)) t];
                      onChanged(all ? rest : [...rest, ...g.types]);
                    },
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                      child: Text(
                        all ? tr('إلغاء الكل', 'Clear') : tr('الكل', 'All'),
                        style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: AqarColors.brand500),
                      ),
                    ),
                  ),
                ),
                TwoColumns(children: [
                  for (final t in g.types)
                    FilterCheckRow(label: unitTypeLabel(t), value: picked.contains(t), onTap: () => onChanged(flipValue(picked, t))),
                ]),
              ],
            );
          }),
        ],
      ],
    );
  }
}

/// Cash / Installments, two equal toggles.
class PaymentChoiceRow extends StatelessWidget {
  const PaymentChoiceRow({super.key, required this.picked, required this.onChanged});

  final List<String> picked;
  final ValueChanged<List<String>> onChanged;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        for (var i = 0; i < paymentChoices.length; i++) ...[
          if (i > 0) const SizedBox(width: 8),
          Expanded(
            child: Builder(builder: (context) {
              final c = paymentChoices[i];
              final on = c.values.any(picked.contains);
              return Material(
                color: on ? AqarColors.brand50 : Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(AqarRadius.control),
                  side: on ? const BorderSide(color: AqarColors.brand500, width: 2) : const BorderSide(color: AqarColors.navy300),
                ),
                child: InkWell(
                  borderRadius: BorderRadius.circular(AqarRadius.control),
                  onTap: () {
                    final rest = [for (final v in picked) if (!c.values.contains(v)) v];
                    onChanged(on ? rest : [...rest, ...c.values]);
                  },
                  child: SizedBox(
                    height: 40,
                    child: Center(
                      child: Text(tr(c.ar, c.en), style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AqarColors.ink900)),
                    ),
                  ),
                ),
              );
            }),
          ),
        ],
      ],
    );
  }
}

/// A removable chip for a picked place.
class PlaceChip extends StatelessWidget {
  const PlaceChip({super.key, required this.place, required this.onRemove});
  final Place place;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) => InkWell(
        borderRadius: BorderRadius.circular(6),
        onTap: onRemove,
        child: Container(
          padding: const EdgeInsetsDirectional.fromSTEB(10, 5, 8, 5),
          decoration: BoxDecoration(
            color: AqarColors.brand50,
            borderRadius: BorderRadius.circular(6),
            border: Border.all(color: AqarColors.brand500),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Flexible: a long compound name ellipsises instead of overflowing the sheet.
              Flexible(
                child: Text(
                  place.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: AqarColors.ink900),
                ),
              ),
              const SizedBox(width: 6),
              const Icon(Icons.close, size: 13, color: AqarColors.ink700),
            ],
          ),
        ),
      );
}

/// A suggestion row: the name, and what kind of place it is (or its area).
class PlaceSuggestionTile extends StatelessWidget {
  const PlaceSuggestionTile({super.key, required this.place, required this.onTap, this.caption});
  final Place place;
  final VoidCallback onTap;
  final String? caption;

  @override
  Widget build(BuildContext context) => InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          child: Row(
            children: [
              Expanded(
                child: Text(place.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 14, color: AqarColors.ink900)),
              ),
              const SizedBox(width: 8),
              Text(
                caption ?? (place.isCompound ? tr('كمبوند', 'Compound') : tr('منطقة', 'Area')),
                style: const TextStyle(fontSize: 12, color: AqarColors.ink400),
              ),
            ],
          ),
        ),
      );
}

/// Arabic-Indic (and Persian) digits typed into a price box still mean a number.
int? parseAmount(String raw) {
  final western = raw.split('').map((ch) {
    final c = ch.codeUnitAt(0);
    if (c >= 0x0660 && c <= 0x0669) return String.fromCharCode(0x30 + c - 0x0660);
    if (c >= 0x06F0 && c <= 0x06F9) return String.fromCharCode(0x30 + c - 0x06F0);
    return ch;
  }).join().replaceAll(RegExp(r'[^0-9]'), '');
  if (western.isEmpty) return null;
  final n = int.tryParse(western);
  return n != null && n > 0 ? n : null;
}

/// Re-groups the digits as they are typed ("8000000" → "8,000,000").
class AmountInputFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    final n = parseAmount(newValue.text);
    final text = n == null ? '' : formatNumber(n, ar: false);
    return TextEditingValue(text: text, selection: TextSelection.collapsed(offset: text.length));
  }
}

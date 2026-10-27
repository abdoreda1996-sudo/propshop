import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/listing.dart';
import '../services/api.dart';
import '../services/lang.dart';
import '../widgets/common.dart';
import '../widgets/listing_card.dart';
import 'listing_screen.dart';

/// Saved listings — the app's twin of /dashboard/saved, on GET /api/saved.
class SavedScreen extends StatefulWidget {
  const SavedScreen({super.key});
  @override
  State<SavedScreen> createState() => _SavedScreenState();
}

class _SavedScreenState extends State<SavedScreen> {
  List<ListingCard> _items = const [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final j = await context.read<Api>().savedListings();
      if (!mounted) return;
      setState(() => _items = ((j['items'] as List?) ?? const []).cast<Map<String, dynamic>>().map(ListingCard.fromJson).toList());
    } on ApiException {
      if (mounted) setState(() => _error = tr('مش قادرين نحمّل المحفوظة.', "We couldn't load your saved units."));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(tr('المحفوظة', 'Saved')), actions: const [LangToggleButton()]),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? ErrorNotice(message: _error!, onRetry: _load)
              : _items.isEmpty
                  ? EmptyState(
                      title: tr('مفيش وحدات محفوظة', 'No saved units'),
                      body: tr('اضغط على القلب في أي وحدة عشان ترجعلها بعدين.', 'Tap the heart on any unit to come back to it later.'),
                    )
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.separated(
                        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                        itemCount: _items.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 10),
                        itemBuilder: (_, i) => ListingCardTile(
                          listing: _items[i],
                          onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => ListingScreen(listing: _items[i]))),
                        ),
                      ),
                    ),
    );
  }
}

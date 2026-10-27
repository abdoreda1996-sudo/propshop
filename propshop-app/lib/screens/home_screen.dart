import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../services/lang.dart';
import '../services/session.dart';
import 'discover_screen.dart';
import 'search_screen.dart';
import 'offers_screen.dart';
import 'deals_screen.dart';
import 'account_screen.dart';

/// App shell. Five tabs matching the website's navigation (Section 26): discover,
/// browse, offers, deals, account.
///
/// Buying and selling are NOT separate apps. A user who owns one unit and is shopping for
/// another sees both sides in Offers and Deals, split only by whose move it is.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  /// The shell's selected tab. Settable from anywhere — signing in lands on Home (0).
  static final tab = ValueNotifier<int>(0);

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int get _index => HomeScreen.tab.value;
  set _index(int i) => HomeScreen.tab.value = i;

  void _onTab() => setState(() {});

  @override
  void initState() {
    super.initState();
    HomeScreen.tab.addListener(_onTab);
  }

  @override
  void dispose() {
    HomeScreen.tab.removeListener(_onTab);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionController>();
    final userKey = session.user?['id'] ?? 'guest';
    // Only what is waiting on THIS user, not a tally of everything.
    final awaitingOffers =
        (session.counts['awaitingOffers'] as num?)?.toInt() ?? 0;
    final openDeals = (session.counts['openDeals'] as num?)?.toInt() ?? 0;
    // Viewings, trades and notifications live under Account, so their "waiting on you"
    // counts badge it.
    final accountWaiting =
        ((session.counts['awaitingViewings'] as num?)?.toInt() ?? 0) +
        ((session.counts['awaitingTrades'] as num?)?.toInt() ?? 0) +
        session.unreadNotifications;

    return Scaffold(
      body: IndexedStack(
        index: _index,
        children: [
          DiscoverScreen(onOpenDashboard: () => setState(() => _index = 4)),
          const SearchScreen(),
          // Keyed by the signed-in user: these load once in initState, and they were
          // built before the session's tokens were read, so after signing in they kept
          // the signed-out answer until pulled to refresh.
          OffersScreen(key: ValueKey('offers-$userKey')),
          DealsScreen(key: ValueKey('deals-$userKey')),
          const AccountScreen(),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: [
          NavigationDestination(
            icon: const Icon(Icons.home_outlined),
            selectedIcon: const Icon(Icons.home),
            label: tr('الرئيسية', 'Home'),
          ),
          NavigationDestination(
            icon: const Icon(Icons.search),
            selectedIcon: const Icon(Icons.search),
            label: tr('الوحدات', 'Units'),
          ),
          // Offers carries the only badge that should ever pull a user in: something is
          // waiting on THEM. A badge that counts everything is a badge people ignore.
          NavigationDestination(
            icon: Badge(
              isLabelVisible: awaitingOffers > 0,
              label: Text('$awaitingOffers'),
              child: const Icon(Icons.handshake_outlined),
            ),
            selectedIcon: const Icon(Icons.handshake),
            label: tr('العروض', 'Offers'),
          ),
          NavigationDestination(
            icon: Badge(
              isLabelVisible: openDeals > 0,
              label: Text('$openDeals'),
              child: const Icon(Icons.fact_check_outlined),
            ),
            selectedIcon: const Icon(Icons.fact_check),
            label: tr('الصفقات', 'Deals'),
          ),
          NavigationDestination(
            icon: Badge(
              isLabelVisible: accountWaiting > 0,
              label: Text('$accountWaiting'),
              child: const Icon(Icons.person_outline),
            ),
            selectedIcon: const Icon(Icons.person),
            label: tr('حسابي', 'Account'),
          ),
        ],
      ),
    );
  }
}

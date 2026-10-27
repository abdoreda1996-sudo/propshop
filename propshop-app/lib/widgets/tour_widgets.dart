import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:video_player/video_player.dart';

import '../models/tour.dart';
import '../services/api.dart';
import '../services/lang.dart';
import '../theme/tokens.dart';

/// The listing screen's virtual tours. Uploaded videos play inline (nothing downloads
/// until the buyer taps play); hosted players and 3D tours open in their own app or the
/// browser, where they work properly.
class TourSection extends StatelessWidget {
  const TourSection({super.key, required this.tours, this.fallbackPoster});
  final List<Tour> tours;
  final String? fallbackPoster;

  @override
  Widget build(BuildContext context) {
    if (tours.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(tr('جولة بالفيديو', 'Video tour'),
            style: const TextStyle(fontSize: 16, height: 1.3, fontWeight: FontWeight.w700, color: AqarColors.ink900)),
        const SizedBox(height: 2),
        Text(tr('فريقنا راجعها قبل ما تظهر.', 'Our team reviewed it before it went up.'),
            style: const TextStyle(fontSize: 12.5, color: AqarColors.ink500)),
        const SizedBox(height: 10),
        for (final t in tours) ...[
          TourCard(tour: t, fallbackPoster: fallbackPoster),
          const SizedBox(height: 12),
        ],
      ],
    );
  }
}

class TourCard extends StatelessWidget {
  const TourCard({super.key, required this.tour, this.fallbackPoster});
  final Tour tour;
  final String? fallbackPoster;

  @override
  Widget build(BuildContext context) {
    // The video, then its caption and source as one plain line. No card around it.
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      ClipRRect(
        borderRadius: BorderRadius.circular(AqarRadius.card),
        child: AspectRatio(
          aspectRatio: 16 / 9,
          child: tour.isVideo
              ? InlineTourVideo(url: absoluteMediaUrl(tour.url), poster: tour.posterUrl ?? fallbackPoster)
              : _ExternalTour(tour: tour, poster: fallbackPoster),
        ),
      ),
      Padding(
        padding: const EdgeInsets.only(top: 6),
        child: Row(children: [
          Expanded(child: Text(tour.caption, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: AqarColors.ink900))),
          const SizedBox(width: 8),
          Text(tour.providerLabel, style: const TextStyle(fontSize: 12, color: AqarColors.ink500)),
        ]),
      ),
    ]);
  }
}

Widget _poster(String? url) => url == null
    ? Container(color: AqarColors.navy900)
    : CachedNetworkImage(
        imageUrl: absoluteMediaUrl(url),
        fit: BoxFit.cover,
        placeholder: (_, __) => Container(color: AqarColors.navy900),
        errorWidget: (_, __, ___) => Container(color: AqarColors.navy900),
      );

/// A plain white label over the dimmed poster: the icon says play, the words say what.
Widget _playButton(IconData icon, String label) => Container(
      padding: const EdgeInsets.fromLTRB(12, 8, 16, 8),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(6)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, color: AqarColors.ink900, size: 22),
        const SizedBox(width: 6),
        Text(label, style: const TextStyle(color: AqarColors.ink900, fontSize: 14, fontWeight: FontWeight.w600)),
      ]),
    );

/// A hosted video or 3D tour: opens in YouTube / Vimeo / the browser.
class _ExternalTour extends StatelessWidget {
  const _ExternalTour({required this.tour, this.poster});
  final Tour tour;
  final String? poster;

  /// The provider's own page rather than the bare embed, so phones open the YouTube or
  /// Vimeo app when it is installed.
  Uri get _target {
    final yt = RegExp(r'youtube-nocookie\.com/embed/([A-Za-z0-9_-]{11})').firstMatch(tour.url);
    if (yt != null) return Uri.parse('https://www.youtube.com/watch?v=${yt.group(1)}');
    final vm = RegExp(r'player\.vimeo\.com/video/(\d+)').firstMatch(tour.url);
    if (vm != null) return Uri.parse('https://vimeo.com/${vm.group(1)}');
    return Uri.parse(tour.url);
  }

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AqarColors.navy900,
      child: InkWell(
        onTap: () => launchUrl(_target, mode: LaunchMode.externalApplication),
        child: Stack(fit: StackFit.expand, children: [
          Opacity(opacity: 0.55, child: _poster(poster)),
          Center(
            child: tour.isImmersive
                ? _playButton(Icons.view_in_ar, tr('ادخل الجولة', 'Enter the tour'))
                : _playButton(Icons.play_arrow_rounded, tr('شغّل الفيديو', 'Play video')),
          ),
        ]),
      ),
    );
  }
}

/// An uploaded tour video. The player is created on first tap, so a listing screen that
/// is only scrolled past downloads nothing.
class InlineTourVideo extends StatefulWidget {
  const InlineTourVideo({super.key, required this.url, this.poster});
  final String url;
  final String? poster;

  @override
  State<InlineTourVideo> createState() => _InlineTourVideoState();
}

class _InlineTourVideoState extends State<InlineTourVideo> {
  VideoPlayerController? _c;
  bool _loading = false;
  bool _failed = false;

  Future<void> _start() async {
    setState(() => _loading = true);
    final c = VideoPlayerController.networkUrl(Uri.parse(widget.url));
    try {
      await c.initialize();
      if (!mounted) return c.dispose();
      c.addListener(() => mounted ? setState(() {}) : null);
      await c.play();
      setState(() {
        _c = c;
        _loading = false;
      });
    } catch (_) {
      await c.dispose();
      if (mounted) {
        setState(() {
          _loading = false;
          _failed = true;
        });
      }
    }
  }

  @override
  void dispose() {
    _c?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = _c;
    if (c == null) {
      return Material(
        color: AqarColors.navy900,
        child: InkWell(
          onTap: _loading ? null : _start,
          child: Stack(fit: StackFit.expand, children: [
            Opacity(opacity: 0.7, child: _poster(widget.poster)),
            Center(
              child: _loading
                  ? const CircularProgressIndicator(color: Colors.white)
                  : _failed
                      ? Text(tr('مش قادرين نشغل الفيديو. جرّب تاني.', "Couldn't play the video. Try again."),
                          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700))
                      : _playButton(Icons.play_arrow_rounded, tr('شغّل الجولة', 'Play the tour')),
            ),
          ]),
        ),
      );
    }
    final v = c.value;
    return Container(
      color: Colors.black,
      child: Stack(alignment: Alignment.bottomCenter, children: [
        Center(child: AspectRatio(aspectRatio: v.aspectRatio == 0 ? 16 / 9 : v.aspectRatio, child: VideoPlayer(c))),
        Positioned.fill(
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: () => v.isPlaying ? c.pause() : c.play(),
            child: AnimatedOpacity(
              opacity: v.isPlaying ? 0 : 1,
              duration: const Duration(milliseconds: 200),
              child: const Center(child: Icon(Icons.play_circle_fill, color: Colors.white70, size: 64)),
            ),
          ),
        ),
        Directionality(
          // Media progress always runs left to right, even in Arabic.
          textDirection: TextDirection.ltr,
          child: VideoProgressIndicator(c, allowScrubbing: true, padding: const EdgeInsets.fromLTRB(8, 0, 8, 6),
              colors: const VideoProgressColors(playedColor: AqarColors.brand500, bufferedColor: Colors.white38, backgroundColor: Colors.white12)),
        ),
      ]),
    );
  }
}

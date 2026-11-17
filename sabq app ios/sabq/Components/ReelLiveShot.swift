import SwiftUI
import Vision

/// «اللقطة الحيّة» لصفحة Reels: صورة الخبر الأفقية لا تُمدّ على الشاشة الطولية
/// كلها (كان ذلك يكبّرها ~3.3 مرة ويقصّ ~70% منها من المنتصف)، بل تحتل أعلى
/// الشاشة بتكبير لا يتجاوز `maxZoom`، تبدأ من موضوعها (نقطة تركيز المحرر، وإلا
/// وجه/مركز المشهد عبر Vision على الجهاز) ثم تمسح المشهد ككاميرا هادئة حتى
/// يُرى كاملًا، وتذوب في خلفية مشتقة من ألوان الصورة نفسها.
struct ReelLiveShot: View {
    let url: URL?
    let focalPoint: ImageFocalPoint?
    /// الارتفاع الخالي فوق نص الخبر؛ الصورة تتمدد نحوه ولا تنزل تحت العنوان.
    let imageRoom: CGFloat
    let isActive: Bool

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var shot: Shot?
    @State private var shown = false
    @State private var failed = false
    @State private var startedAt = Date()
    /// موضع حدّده القارئ بإصبعه (0…1)؛ يوقف الحركة التلقائية حتى مغادرة الصفحة.
    @State private var manualPan: CGFloat?
    /// حالة السحب الجاري؛ GestureState تُصفَّر تلقائيًا حتى لو أُلغيت الإيماءة.
    @GestureState private var drag = DragTrack()

    private struct DragTrack {
        var base: CGFloat?
        var rejected = false
    }

    private static let maxZoom: CGFloat = 1.75
    private static let backdrop = Color(red: 0.1, green: 0.14, blue: 0.18)

    struct Shot {
        let image: UIImage
        let ambient: UIImage
        /// مركز الموضوع بإحداثيات الوحدة، الأصل أعلى اليسار.
        let focus: CGPoint
    }

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .top) {
                Self.backdrop
                if let shot {
                    let layout = Layout(image: shot.image.size, container: proxy.size,
                                        imageRoom: imageRoom, focus: shot.focus)
                    Group {
                        ambient(shot.ambient, in: proxy.size)
                        TimelineView(.animation(paused: !pans(layout))) { timeline in
                            picture(shot.image, layout: layout, progress: progress(layout, at: timeline.date))
                        }
                    }
                    .opacity(shown ? 1 : 0)
                } else {
                    Image("SabqLogo").renderingMode(.template).resizable().scaledToFit()
                        .frame(width: 90).foregroundStyle(.white.opacity(0.16))
                        .frame(width: proxy.size.width, height: proxy.size.height)
                        .environment(\.sabqImageLoadFailed, failed || url == nil)
                }
            }
            .frame(width: proxy.size.width, height: proxy.size.height, alignment: .top)
            .clipped()
            // الإزاحات محسوبة من أعلى اليسار؛ التطبيق كله RTL.
            .environment(\.layoutDirection, .leftToRight)
        }
        .task(id: url) { await load(url) }
        .onChange(of: isActive) { _, _ in
            startedAt = Date()
            manualPan = nil
        }
    }

    // MARK: - Layout

    struct Layout {
        let block: CGSize
        let drawn: CGSize
        let travel: CGSize
        /// موضع البداية على محور الحركة (0…1) والإزاحة الثابتة على المحور الآخر.
        let start: CGFloat
        let horizontal: Bool
        let crossOffset: CGFloat

        init(image: CGSize, container: CGSize, imageRoom: CGFloat, focus: CGPoint) {
            let width = max(1, container.width)
            let imgW = max(1, image.width), imgH = max(1, image.height)
            let natural = width * imgH / imgW
            let room = max(0, imageRoom)
            let blockH: CGFloat
            if natural > room * 1.08 {
                // صورة طولية/إنفوجرافيك أو نص طويل على شاشة صغيرة: بعرض الشاشة بلا تكبير.
                blockH = min(natural, max(room * 1.08, container.height * 0.36))
            } else {
                blockH = min(room * 1.08, natural * ReelLiveShot.maxZoom)
            }
            let scale = max(width / imgW, blockH / imgH)
            block = CGSize(width: width, height: blockH)
            drawn = CGSize(width: imgW * scale, height: imgH * scale)
            travel = CGSize(width: max(0, drawn.width - width), height: max(0, drawn.height - blockH))
            horizontal = travel.width >= travel.height
            func offset(_ drawn: CGFloat, _ block: CGFloat, _ travel: CGFloat, _ focus: CGFloat) -> CGFloat {
                min(travel, max(0, drawn * focus - block / 2))
            }
            let x = offset(drawn.width, width, travel.width, focus.x)
            let y = offset(drawn.height, blockH, travel.height, focus.y)
            if horizontal {
                start = travel.width > 0 ? x / travel.width : 0
                crossOffset = y
            } else {
                start = travel.height > 0 ? y / travel.height : 0
                crossOffset = x
            }
        }

        var panTravel: CGFloat { horizontal ? travel.width : travel.height }
    }

    private func pans(_ layout: Layout) -> Bool {
        isActive && !reduceMotion && manualPan == nil && layout.panTravel > 8
    }

    /// يثبت على الموضوع، ثم يذهب إلى الطرف الأبعد، ثم يتأرجح بين الطرفين.
    private func progress(_ layout: Layout, at date: Date) -> CGFloat {
        if let manualPan { return manualPan }
        guard pans(layout) else { return layout.start }
        func ease(_ x: Double) -> CGFloat { CGFloat(x * x * (3 - 2 * x)) }
        let hold = 1.8, rest = 1.0
        let sweep = min(14, max(5, Double(layout.panTravel) / 24))
        let first: CGFloat = layout.start < 0.5 ? 1 : 0
        let firstLeg = max(1.5, sweep * Double(abs(first - layout.start)))
        var t = date.timeIntervalSince(startedAt)
        if t < hold { return layout.start }
        t -= hold
        if t < firstLeg { return layout.start + (first - layout.start) * ease(t / firstLeg) }
        t -= firstLeg
        let cycle = 2 * (rest + sweep)
        t = t.truncatingRemainder(dividingBy: cycle)
        let other = 1 - first
        if t < rest { return first }
        t -= rest
        if t < sweep { return first + (other - first) * ease(t / sweep) }
        t -= sweep
        if t < rest { return other }
        t -= rest
        return other + (first - other) * ease(t / sweep)
    }

    // MARK: - Pieces

    private func ambient(_ image: UIImage, in size: CGSize) -> some View {
        ZStack {
            Image(uiImage: image)
                .resizable()
                .interpolation(.high)
                .scaledToFill()
                .frame(width: size.width, height: size.height)
                .blur(radius: 40, opaque: true)
                .saturation(1.5)
                .clipped()
            Color.black.opacity(0.56)
        }
        .frame(width: size.width, height: size.height)
        .accessibilityHidden(true)
    }

    private func picture(_ image: UIImage, layout: Layout, progress: CGFloat) -> some View {
        let along = progress * layout.panTravel
        let x = layout.horizontal ? along : layout.crossOffset
        let y = layout.horizontal ? layout.crossOffset : along
        return Image(uiImage: image)
            .resizable()
            .interpolation(.high)
            .frame(width: layout.drawn.width, height: layout.drawn.height)
            .offset(x: -x, y: -y)
            .frame(width: layout.block.width, height: layout.block.height, alignment: .topLeading)
            .clipped()
            .mask(LinearGradient(stops: [
                .init(color: .black, location: 0),
                .init(color: .black, location: 0.64),
                .init(color: .clear, location: 1)
            ], startPoint: .top, endPoint: .bottom))
            .contentShape(Rectangle())
            .simultaneousGesture(panGesture(layout))
            .animation(nil, value: layout.block)
    }

    /// السحب الأفقي يحرّك الكاميرا؛ العمودي يبقى لتقليب الأخبار.
    private func panGesture(_ layout: Layout) -> some Gesture {
        DragGesture(minimumDistance: 12)
            .updating($drag) { value, track, _ in
                guard layout.horizontal, layout.panTravel > 8, !track.rejected else { return }
                if track.base == nil {
                    guard abs(value.translation.width) > abs(value.translation.height) * 1.3 else {
                        track.rejected = true
                        return
                    }
                    track.base = progress(layout, at: Date())
                }
            }
            .onChanged { value in
                guard let base = drag.base else { return }
                manualPan = min(1, max(0, base - value.translation.width / layout.panTravel))
            }
    }

    // MARK: - Loading

    @MainActor
    private func load(_ requestedURL: URL?) async {
        failed = false
        shown = false
        shot = nil
        manualPan = nil
        guard let requestedURL else { return }
        let budget: CGFloat = 1600
        var image = ImageCache.cached(requestedURL, minPixelSize: budget)
        if image == nil {
            let fetchURL = ImageCDN.sized(requestedURL, width: Int(budget))
            for attempt in 0..<2 {
                if Task.isCancelled { return }
                image = await Task.detached(priority: .userInitiated) { () -> UIImage? in
                    guard let (data, _) = try? await ImageCache.imageSession.data(from: fetchURL) else {
                        return nil
                    }
                    return ImageCache.decodedImage(data: data, maxPixelSize: budget)
                }.value
                if image != nil { break }
                if attempt == 0 && !Task.isCancelled {
                    try? await Task.sleep(nanoseconds: 500_000_000)
                }
            }
            if let image { ImageCache.store(image, for: requestedURL, budget: budget) }
        }
        guard !Task.isCancelled, url == requestedURL else { return }
        guard let image else {
            failed = true
            return
        }
        let editorFocus = focalPoint?.unit
        let prepared = await Task.detached(priority: .userInitiated) { () -> (UIImage, CGPoint) in
            let focus = editorFocus ?? ReelSubjectFinder.focus(of: image, key: requestedURL)
            return (ReelSubjectFinder.ambient(of: image), focus)
        }.value
        guard !Task.isCancelled, url == requestedURL else { return }
        shot = Shot(image: image, ambient: prepared.0, focus: prepared.1)
        startedAt = Date()
        withAnimation(.easeOut(duration: 0.25)) { shown = true }
    }
}

/// اكتشاف موضوع الصورة على الجهاز: الوجوه أولًا (مرجّحة بمساحتها)، وإلا أبرز
/// منطقة لافتة للنظر، وإلا المنتصف. النتيجة تُخبّأ لكل رابط.
nonisolated enum ReelSubjectFinder {
    nonisolated(unsafe) private static let cache = NSCache<NSURL, NSValue>()

    static func focus(of image: UIImage, key: URL) -> CGPoint {
        if let hit = cache.object(forKey: key as NSURL) { return hit.cgPointValue }
        let point = detect(image) ?? CGPoint(x: 0.5, y: 0.5)
        cache.setObject(NSValue(cgPoint: point), forKey: key as NSURL)
        return point
    }

    private static func detect(_ image: UIImage) -> CGPoint? {
        guard let cgImage = image.cgImage else { return nil }
        let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
        let faces = VNDetectFaceRectanglesRequest()
        if (try? handler.perform([faces])) != nil,
           let point = centroid(of: (faces.results ?? []).map(\.boundingBox)) {
            return point
        }
        let saliency = VNGenerateAttentionBasedSaliencyImageRequest()
        if (try? handler.perform([saliency])) != nil,
           let objects = saliency.results?.first?.salientObjects,
           let point = centroid(of: objects.map(\.boundingBox)) {
            return point
        }
        return nil
    }

    /// مركز ثقل الصناديق مرجّحًا بالمساحة؛ Vision أصله أسفل اليسار فنقلب Y.
    private static func centroid(of boxes: [CGRect]) -> CGPoint? {
        var x: CGFloat = 0, y: CGFloat = 0, weight: CGFloat = 0
        for box in boxes {
            let area = box.width * box.height
            guard area > 0 else { continue }
            x += box.midX * area
            y += (1 - box.midY) * area
            weight += area
        }
        guard weight > 0 else { return nil }
        return CGPoint(x: min(1, max(0, x / weight)), y: min(1, max(0, y / weight)))
    }

    /// نسخة ضئيلة من الصورة تكفي لاشتقاق لون الخلفية بلا كلفة تمويه صورة كاملة.
    static func ambient(of image: UIImage) -> UIImage {
        let aspect = max(0.2, min(5, image.size.height / max(1, image.size.width)))
        let size = CGSize(width: 24, height: max(4, (24 * aspect).rounded()))
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        return UIGraphicsImageRenderer(size: size, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }
    }
}

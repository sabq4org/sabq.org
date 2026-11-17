import SwiftUI

/// A fixed snapshot of the latest feed: returning from the reader never moves a reel.
struct NewsReelsView: View {
    let articles: [Article]
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var position: Int? = 0
    @State private var selectedArticle: Article?
    @State private var showsIndex = false
    @State private var readerPath = NavigationPath()

    private var currentIndex: Int { min(max(position ?? 0, 0), max(articles.count - 1, 0)) }

    var body: some View {
        GeometryReader { container in
            GeometryReader { geometry in
                ZStack(alignment: .top) {
                    Color.black
                    if articles.isEmpty {
                        ContentUnavailableView("لا توجد أخبار", systemImage: "newspaper")
                            .foregroundStyle(.white)
                    } else {
                        ScrollView(.vertical) {
                            LazyVStack(spacing: 0) {
                                ForEach(Array(articles.enumerated()), id: \.offset) { index, article in
                                    NewsReelsPage(
                                        article: article,
                                        nextArticle: index + 1 < articles.count ? articles[index + 1] : nil,
                                        bottomInset: max(container.safeAreaInsets.bottom, 12),
                                        topInset: container.safeAreaInsets.top + 66,
                                        isActive: index == currentIndex && selectedArticle == nil,
                                        canRestart: articles.count > 1,
                                        read: {
                                        readerPath = NavigationPath()
                                        selectedArticle = article
                                    },
                                        next: { move(to: index + 1) },
                                        restart: { move(to: 0) }
                                    )
                                    .frame(width: geometry.size.width, height: geometry.size.height)
                                    .clipped()
                                    .id(index)
                                    .accessibilityHidden(index != currentIndex)
                                }
                            }
                            .scrollTargetLayout()
                        }
                        .scrollTargetBehavior(.paging)
                        .scrollPosition(id: $position)
                        .scrollIndicators(.hidden)
                        .accessibilityIdentifier("newsReels.feed")
                    }
                    header
                        .padding(.horizontal, 18)
                        .padding(.top, container.safeAreaInsets.top + 8)
                }
            }
            .ignoresSafeArea()
        }
        .environment(\.layoutDirection, .rightToLeft)
        .preferredColorScheme(.dark)
        .fullScreenCover(item: $selectedArticle) { article in
            SabqTabNavigation(path: $readerPath, usesReaderColumns: false) {
                ArticleDetailView(article: article)
                    .toolbar {
                        ToolbarItem(placement: .topBarLeading) {
                            Button {
                                selectedArticle = nil
                            } label: {
                                Label("العودة إلى Reels", systemImage: "chevron.right")
                            }
                            .accessibilityIdentifier("newsReels.detailBack")
                        }
                    }
            }
            .environment(\.layoutDirection, .rightToLeft)
        }
        .sheet(isPresented: $showsIndex) {
            NavigationStack {
                List(Array(articles.enumerated()), id: \.offset) { index, article in
                    Button {
                        showsIndex = false
                        move(to: index)
                    } label: {
                        HStack(spacing: 12) {
                            Text(String(format: "%02d", index + 1))
                                .monospacedDigit()
                                .foregroundStyle(.secondary)
                            Text(article.title)
                                .font(.custom(SabqFonts.medium, size: 17, relativeTo: .body))
                                .foregroundStyle(.primary)
                            if index == currentIndex {
                                Image(systemName: "checkmark").accessibilityLabel("الخبر الحالي")
                            }
                        }
                    }
                }
                .navigationTitle("أخبار Reels")
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("تم") { showsIndex = false }
                    }
                }
            }
            .environment(\.layoutDirection, .rightToLeft)
        }
    }

    private var header: some View {
        HStack(spacing: 10) {
            Button { dismiss() } label: {
                Image(systemName: "xmark").frame(width: 44, height: 44)
                    .background(.black.opacity(0.28), in: Circle())
            }
            .accessibilityLabel("إغلاق Reels")
            .accessibilityIdentifier("newsReels.close")
            Button { showsIndex = true } label: {
                HStack(spacing: 6) {
                    Text(String(format: "%02d / %02d", articles.isEmpty ? 0 : currentIndex + 1, articles.count))
                        .font(.system(size: 12, weight: .semibold, design: .monospaced))
                        .accessibilityLabel("خبر \(articles.isEmpty ? 0 : currentIndex + 1) من \(articles.count)")
                        .accessibilityValue(articles.isEmpty ? "" : articles[currentIndex].id)
                        .accessibilityIdentifier("newsReels.position")
                    Image(systemName: "square.stack").font(.system(size: 11))
                }
                .padding(.horizontal, 10).frame(minHeight: 32)
                .background(.black.opacity(0.28), in: Capsule())
                .frame(minHeight: 44)
            }
            .accessibilityLabel("فهرس الأخبار")
            .accessibilityValue(articles.isEmpty ? "" : articles[currentIndex].id)
            .accessibilityIdentifier("newsReels.index")
            .disabled(articles.isEmpty)
            Spacer(minLength: 8)
            HStack(spacing: 10) {
                Text("Reels").font(.system(size: 17, weight: .semibold))
                Rectangle().fill(.white.opacity(0.4)).frame(width: 1, height: 22)
                Image("SabqLogoWhite")
                    .resizable().scaledToFit().frame(width: 34, height: 34)
                    .accessibilityLabel("سبق")
            }
        }
        .environment(\.layoutDirection, .leftToRight)
        .foregroundStyle(.white)
        .buttonStyle(.plain)
    }

    private func move(to index: Int) {
        guard articles.indices.contains(index) else { return }
        withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.3)) { position = index }
    }
}

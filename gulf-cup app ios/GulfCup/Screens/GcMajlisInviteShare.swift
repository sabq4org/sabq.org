import SwiftUI
import CoreTransferable
import UniformTypeIdentifiers
import UIKit

struct GcShareablePng: Transferable {
    let data: Data

    static var transferRepresentation: some TransferRepresentation {
        DataRepresentation(exportedContentType: .png) { item in
            item.data
        }
    }
}

struct GcMajlisInviteShareCard: View {
    let majlis: GcMajlisSummary
    let inviteURL: URL

    var body: some View {
        ZStack {
            GcTheme.heroGradient
            GcHeroDecor()

            Circle()
                .fill(GcTheme.sky.opacity(0.16))
                .frame(width: 250, height: 250)
                .blur(radius: 2)
                .offset(x: -150, y: -205)

            VStack(spacing: 20) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(L("majlis.invite.eyebrow"))
                            .font(GulfCupFonts.app(size: 11, weight: .bold))
                            .foregroundStyle(GcTheme.skyLite)
                        Text(L("brand.by"))
                            .font(GulfCupFonts.app(size: 9))
                            .foregroundStyle(.white.opacity(0.62))
                    }
                    Spacer()
                    Image("Emblem")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 52, height: 76)
                        .accessibilityHidden(true)
                }

                VStack(spacing: 8) {
                    Text(L("majlis.invite.joinUs"))
                        .font(GulfCupFonts.app(size: 15, weight: .semibold))
                        .foregroundStyle(GcTheme.onHeroDim)
                    Text(majlis.name)
                        .font(GulfCupFonts.headline(size: 31))
                        .foregroundStyle(.white)
                        .multilineTextAlignment(.center)
                        .lineLimit(2)
                        .minimumScaleFactor(0.68)
                    Text(L("majlis.invite.tagline"))
                        .font(GulfCupFonts.app(size: 12))
                        .foregroundStyle(.white.opacity(0.72))
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity)

                VStack(spacing: 7) {
                    Text(L("majlis.invite.code"))
                        .font(GulfCupFonts.app(size: 10, weight: .semibold))
                        .foregroundStyle(GcTheme.onHeroDim)
                    Text(verbatim: majlis.code)
                        .font(.system(size: 29, weight: .heavy, design: .rounded).monospaced())
                        .tracking(3)
                        .foregroundStyle(GcTheme.skyDeep)
                        .environment(\.layoutDirection, .leftToRight)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .fill(Color.white.opacity(0.94))
                )

                HStack(spacing: 10) {
                    Label("\(majlis.membersCount)/50", systemImage: "person.2.fill")
                    Spacer()
                    Text(inviteURL.host ?? "sabq.org")
                    Image(systemName: "arrow.up.left")
                }
                .font(GulfCupFonts.app(size: 10.5, weight: .semibold))
                .foregroundStyle(.white.opacity(0.68))
            }
            .padding(26)
        }
        .frame(width: 360, height: 450)
        .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .stroke(Color.white.opacity(0.14), lineWidth: 1)
        )
        .environment(\.colorScheme, .dark)
        .environment(\.layoutDirection, .rightToLeft)
    }
}

struct GcMajlisInviteSheet: View {
    let majlis: GcMajlisSummary
    @Environment(\.dismiss) private var dismiss
    @State private var renderedImage: UIImage?
    @State private var shareItem: GcShareablePng?
    @State private var copied = false

    private var inviteURL: URL {
        URL(string: "\(URLConstants.webOrigin)/gulf-cup/majlis?code=\(majlis.code)")!
    }

    private var shareMessage: String {
        L("majlis.invite.shareMessage", ["name": majlis.name, "code": majlis.code])
            + "\n\(inviteURL.absoluteString)"
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    GcMajlisInviteShareCard(majlis: majlis, inviteURL: inviteURL)
                        .frame(maxWidth: .infinity)
                        .scaleEffect(0.86)
                        .frame(height: 390)
                        .accessibilityElement(children: .combine)
                        .accessibilityLabel(L("majlis.invite.previewA11y", ["name": majlis.name, "code": majlis.code]))

                    VStack(spacing: 10) {
                        if let shareItem, let renderedImage {
                            ShareLink(
                                item: shareItem,
                                subject: Text(L("majlis.invite.subject", ["name": majlis.name])),
                                message: Text(shareMessage),
                                preview: SharePreview(
                                    L("majlis.invite.subject", ["name": majlis.name]),
                                    image: Image(uiImage: renderedImage)
                                )
                            ) {
                                Label(L("majlis.invite.share"), systemImage: "square.and.arrow.up")
                                    .font(GulfCupFonts.app(size: 15, weight: .bold))
                                    .foregroundStyle(.white)
                                    .frame(maxWidth: .infinity, minHeight: 50)
                                    .background(
                                        RoundedRectangle(cornerRadius: GcTheme.buttonRadius, style: .continuous)
                                            .fill(GcTheme.sky)
                                    )
                            }
                            .buttonStyle(GcPressStyle())
                        } else {
                            HStack(spacing: 8) {
                                ProgressView().tint(GcTheme.sky)
                                Text(L("majlis.invite.preparing"))
                                    .font(GulfCupFonts.app(size: 13, weight: .semibold))
                            }
                            .frame(maxWidth: .infinity, minHeight: 50)
                        }

                        Button {
                            UIPasteboard.general.string = inviteURL.absoluteString
                            copied = true
                        } label: {
                            Label(
                                copied ? L("majlis.invite.copied") : L("majlis.invite.copyLink"),
                                systemImage: copied ? "checkmark" : "link"
                            )
                            .font(GulfCupFonts.app(size: 14, weight: .bold))
                            .foregroundStyle(GcTheme.skyDeep)
                            .frame(maxWidth: .infinity, minHeight: 48)
                            .background(
                                RoundedRectangle(cornerRadius: GcTheme.buttonRadius, style: .continuous)
                                    .fill(GcTheme.sky.opacity(0.12))
                            )
                        }
                        .buttonStyle(GcPressStyle())
                        .accessibilityHint(inviteURL.absoluteString)
                    }
                }
                .padding(18)
            }
            .background(GcTheme.appBg.ignoresSafeArea())
            .navigationTitle(L("majlis.invite.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L("auth.close")) { dismiss() }
                }
            }
        }
        .presentationDetents([.large])
        .task { render() }
    }

    @MainActor
    private func render() {
        let card = GcMajlisInviteShareCard(majlis: majlis, inviteURL: inviteURL)
        let renderer = ImageRenderer(content: card)
        renderer.scale = 3
        renderer.isOpaque = true
        guard let image = renderer.uiImage, let png = image.pngData() else { return }
        renderedImage = image
        shareItem = GcShareablePng(data: png)
    }
}

struct GcMajlisHarvestShareCard: View {
    let data: GcMajlisHarvestResponse

    private var championNames: String {
        data.awards.champions.map(\.name).joined(separator: " · ")
    }

    var body: some View {
        ZStack {
            GcTheme.heroGradient
            GcHeroDecor()
            Circle()
                .fill(GcTheme.sky.opacity(0.15))
                .frame(width: 260, height: 260)
                .offset(x: 150, y: 210)

            VStack(spacing: 18) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(L("majlis.harvest.title"))
                            .font(GulfCupFonts.headline(size: 20))
                            .foregroundStyle(.white)
                        Text(data.majlis.name)
                            .font(GulfCupFonts.app(size: 11.5, weight: .semibold))
                            .foregroundStyle(GcTheme.onHeroDim)
                            .lineLimit(1)
                    }
                    Spacer()
                    Image("Emblem")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 46, height: 68)
                }

                VStack(spacing: 8) {
                    Image(systemName: "trophy.fill")
                        .font(.system(size: 31, weight: .semibold))
                        .foregroundStyle(GcTheme.skyLite)
                    Text(L("majlis.harvest.champion"))
                        .font(GulfCupFonts.app(size: 10.5, weight: .bold))
                        .foregroundStyle(GcTheme.onHeroDim)
                    Text(championNames)
                        .font(GulfCupFonts.headline(size: 25))
                        .foregroundStyle(.white)
                        .multilineTextAlignment(.center)
                        .lineLimit(2)
                        .minimumScaleFactor(0.72)
                    if let points = data.awards.champions.first?.totalPoints {
                        Text("\(points) \(L("account.pts"))")
                            .font(GulfCupFonts.app(size: 15, weight: .bold))
                            .foregroundStyle(GcTheme.skyLite)
                            .monospacedDigit()
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 15)
                .background(RoundedRectangle(cornerRadius: 18).fill(Color.white.opacity(0.08)))

                HStack(spacing: 8) {
                    harvestAward(
                        icon: "scope",
                        title: L("majlis.harvest.accurate"),
                        name: data.awards.mostAccurate.first?.name
                    )
                    harvestAward(
                        icon: "flame.fill",
                        title: L("majlis.harvest.bold"),
                        name: data.awards.boldest.first?.name
                    )
                    harvestAward(
                        icon: "repeat",
                        title: L("majlis.harvest.stubborn"),
                        name: data.awards.stubborn.first?.name
                    )
                }

                HStack {
                    Text(L("majlis.harvest.shareCard.subtitle"))
                    Spacer()
                    Text("sabq.org")
                }
                .font(GulfCupFonts.app(size: 9.5, weight: .semibold))
                .foregroundStyle(.white.opacity(0.58))
            }
            .padding(25)
        }
        .frame(width: 360, height: 450)
        .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 28).stroke(Color.white.opacity(0.14)))
        .environment(\.colorScheme, .dark)
        .environment(\.layoutDirection, .rightToLeft)
    }

    private func harvestAward(icon: String, title: String, name: String?) -> some View {
        VStack(spacing: 5) {
            Image(systemName: icon)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(GcTheme.skyLite)
            Text(title)
                .font(GulfCupFonts.app(size: 8.5, weight: .bold))
                .foregroundStyle(GcTheme.onHeroDim)
            Text(name ?? "—")
                .font(GulfCupFonts.app(size: 10.5, weight: .bold))
                .foregroundStyle(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.72)
        }
        .frame(maxWidth: .infinity, minHeight: 70)
        .padding(.horizontal, 5)
        .background(RoundedRectangle(cornerRadius: 13).fill(Color.white.opacity(0.07)))
    }
}

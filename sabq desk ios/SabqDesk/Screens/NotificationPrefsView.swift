import SabqDeskDesign
import SabqDeskKit
import SwiftUI
import UIKit

/// «الإعدادات / التنبيهات» (approved mockup 2026-10-26): quiet hours on a
/// 24-hour bar, one switch per kind of push the member can receive, and a
/// live preview of how a push lands right now.
struct NotificationPrefsView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                header
                QuietHoursGroup(selection: prefs.quietHours) { choice in
                    update(StaffAlertPrefsUpdate(quietHours: choice))
                }
                if !kinds.isEmpty {
                    PrefsSection(title: "ما يصلك على الجوال") {
                        VStack(spacing: 0) {
                            ForEach(Array(kinds.enumerated()), id: \.element) { index, kind in
                                KindRow(kind: kind, isOn: binding(for: kind))
                                if index < kinds.count - 1 {
                                    Rectangle().fill(DeskTheme.hairline).frame(height: 1)
                                }
                            }
                        }
                        .padding(.horizontal, 18)
                        .background(Color.white, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                    }
                }
                if let error = model.alertPrefsError {
                    Text(error)
                        .deskText(DeskType.meta)
                        .foregroundStyle(DeskTheme.danger)
                        .padding(.horizontal, 6)
                }
                PrefsSection(title: "هكذا يظهر التنبيه الآن") {
                    PushPreview(text: previewText)
                }
                Button {
                    if let url = URL(string: UIApplication.openNotificationSettingsURLString) { openURL(url) }
                } label: {
                    HStack(spacing: 6) {
                        Text("إعدادات الإشعارات في الجهاز")
                            .deskText(PrefsType.hint)
                        Image(systemName: "arrow.up.forward")
                            .font(.system(size: 11, weight: .semibold))
                            .accessibilityHidden(true)
                    }
                    .foregroundStyle(DeskInk.link)
                    .frame(maxWidth: .infinity, minHeight: DeskLayout.touchTarget)
                }
                .buttonStyle(.plain)
                .accessibilityHint("يفتح إعدادات النظام")
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
        }
        .scrollContentBackground(.hidden)
        .background(PrefsInk.page.ignoresSafeArea())
        .contentMargins(.bottom, DeskLayout.tabBarClearance, for: .scrollContent)
        .toolbar(.hidden, for: .navigationBar)
        .task { await model.loadAlertPrefsIfNeeded() }
    }

    private var header: some View {
        HStack(spacing: 12) {
            Button { dismiss() } label: {
                Image(systemName: "chevron.backward")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(DeskInk.strong)
                    .frame(width: 44, height: 44)
                    .background(Color.white, in: Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("رجوع")
            VStack(alignment: .leading, spacing: 0) {
                Text("الإعدادات")
                    .deskText(PrefsType.parent)
                    .foregroundStyle(PrefsInk.secondary)
                Text("التنبيهات")
                    .deskText(PrefsType.title)
                    .foregroundStyle(DeskInk.strong)
                    .accessibilityAddTraits(.isHeader)
            }
        }
        .padding(.top, 8)
    }

    private var prefs: StaffAlertPrefs { model.alertPrefs ?? StaffAlertPrefs() }

    /// Only the kinds this member can actually receive.
    private var kinds: [PushKind] {
        let caps = model.capabilities
        var out: [PushKind] = []
        if caps.canTickets { out.append(.writerMessages) }
        if caps.canSocial.view { out.append(.socialProposals) }
        if caps.canAdminAlerts { out.append(.adminAlerts) }
        if caps.canSystemHealth { out.append(.aiAlerts) }
        return out
    }

    private func binding(for kind: PushKind) -> Binding<Bool> {
        Binding(get: { kind.isOn(in: prefs) },
                set: { value in update(kind.update(value)) })
    }

    private func update(_ change: StaffAlertPrefsUpdate) {
        Task { await model.updateAlertPrefs(change) }
    }

    private var previewText: String {
        let hour = RiyadhTime.calendar.component(.hour, from: Date())
        if prefs.quietHours.isQuiet(hour: hour), let window = prefs.quietHours.window {
            return "الساعات الهادئة: يصلك التنبيه بصمت حتى \(PushKind.hourLabel(window.end))، وتجده في مركز الإشعارات."
        }
        if let first = kinds.first(where: { $0.isOn(in: prefs) }) {
            return first.sample
        }
        return "التنبيهات متوقفة كلها."
    }
}

// MARK: - Tokens from the approved mockup

private enum PrefsInk {
    static let page = Color(red: 0xF5 / 255, green: 0xF7 / 255, blue: 0xFA / 255)
    static let secondary = Color(red: 0x5B / 255, green: 0x6B / 255, blue: 0x7C / 255)
    static let switchOff = Color(red: 0xD5 / 255, green: 0xDD / 255, blue: 0xE5 / 255)
    static let barIdle = Color(red: 0xE3 / 255, green: 0xEA / 255, blue: 0xF1 / 255)
    static let amberTint = Color(red: 0xFF / 255, green: 0xF6 / 255, blue: 0xE5 / 255)
    static let amberInk = Color(red: 0x94 / 255, green: 0x60 / 255, blue: 0x00 / 255)
    static let previewOutline = Color(red: 0xE6 / 255, green: 0xEC / 255, blue: 0xF2 / 255)
}

private enum PrefsType {
    static let parent = DeskTextRole(size: 13, weight: .regular, style: .footnote, lineSpacing: 0)
    static let title = DeskTextRole(size: 22, weight: .bold, style: .title2, lineSpacing: 0)
    static let groupTitle = DeskTextRole(size: 16, weight: .semibold, style: .headline, lineSpacing: 0)
    static let rowTitle = DeskTextRole(size: 15, weight: .semibold, style: .subheadline, lineSpacing: 0)
    static let hint = DeskTextRole(size: 12, weight: .regular, style: .caption, lineSpacing: 2)
    static let section = DeskTextRole(size: 13, weight: .regular, style: .footnote, lineSpacing: 0)
    static let chip = DeskTextRole(size: 14, weight: .semibold, style: .subheadline, lineSpacing: 0)
    static let axis = DeskTextRole(size: 11, weight: .regular, style: .caption2, lineSpacing: 0)
    static let preview = DeskTextRole(size: 13, weight: .regular, style: .footnote, lineSpacing: 2)
    static let previewName = DeskTextRole(size: 13, weight: .semibold, style: .footnote, lineSpacing: 0)
}

// MARK: - Kinds

private enum PushKind: Hashable {
    case writerMessages, socialProposals, adminAlerts, aiAlerts

    var title: String {
        switch self {
        case .writerMessages: return "رسائل الكتّاب"
        case .socialProposals: return "مقترحات النشر على X"
        case .adminAlerts: return "تنبيهات الإدارة"
        case .aiAlerts: return "نماذج الذكاء الاصطناعي"
        }
    }

    var hint: String {
        switch self {
        case .writerMessages: return "استفسار جديد أو رد من كاتب"
        case .socialProposals: return "مقترح ينتظر موافقتك"
        case .adminAlerts: return "فشل نشر تغريدة أو ما يحتاج تدخلك"
        case .aiAlerts: return "تعطل نموذج أو اقتراب الرصيد من نهايته"
        }
    }

    var sample: String {
        switch self {
        case .writerMessages: return "رسالة جديدة من كاتب رأي تنتظر ردك."
        case .socialProposals: return "مقترح نشر على X ينتظر موافقتك."
        case .adminAlerts: return "فشل نشر تغريدة، افتح التنبيهات لإعادة المحاولة."
        case .aiAlerts: return "أحد نماذج الذكاء الاصطناعي متوقف الآن."
        }
    }

    var tint: Color {
        switch self {
        case .writerMessages: return DeskTheme.bubbleBlue
        case .socialProposals, .aiAlerts: return DeskTheme.chipGrey
        case .adminAlerts: return PrefsInk.amberTint
        }
    }

    var ink: Color {
        switch self {
        case .writerMessages: return DeskTheme.link
        case .socialProposals, .aiAlerts: return DeskTheme.navy
        case .adminAlerts: return PrefsInk.amberInk
        }
    }

    func isOn(in prefs: StaffAlertPrefs) -> Bool {
        switch self {
        case .writerMessages: return prefs.writerMessages
        case .socialProposals: return prefs.socialProposals
        case .adminAlerts: return prefs.adminAlerts
        case .aiAlerts: return prefs.aiAlerts
        }
    }

    func update(_ value: Bool) -> StaffAlertPrefsUpdate {
        switch self {
        case .writerMessages: return StaffAlertPrefsUpdate(writerMessages: value)
        case .socialProposals: return StaffAlertPrefsUpdate(socialProposals: value)
        case .adminAlerts: return StaffAlertPrefsUpdate(adminAlerts: value)
        case .aiAlerts: return StaffAlertPrefsUpdate(aiAlerts: value)
        }
    }

    /// `07:00`, Latin digits.
    static func hourLabel(_ hour: Int) -> String {
        "\u{2066}" + String(format: "%02d:00", hour) + "\u{2069}"
    }
}

// MARK: - Pieces

private struct PrefsSection<Content: View>: View {
    let title: String
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .deskText(PrefsType.section)
                .foregroundStyle(PrefsInk.secondary)
                .padding(.horizontal, 6)
                .accessibilityAddTraits(.isHeader)
            content()
        }
    }
}

/// The screen's one bold touch: quiet hours drawn as tall blue bars on a
/// 24-hour strip, with three presets under it.
private struct QuietHoursGroup: View {
    let selection: StaffQuietHours
    let pick: (StaffQuietHours) -> Void

    private let presets: [(StaffQuietHours, String)] = [
        (.night, "الليل"),
        (.offhours, "خارج الدوام"),
        (.off, "بلا هدوء"),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline) {
                Text("الساعات الهادئة")
                    .deskText(PrefsType.groupTitle)
                    .foregroundStyle(DeskInk.strong)
                Spacer()
                Text(rangeLabel)
                    .deskText(PrefsType.previewName)
                    .foregroundStyle(DeskInk.link)
            }
            .accessibilityElement(children: .combine)

            VStack(spacing: 6) {
                HStack(alignment: .bottom, spacing: 3) {
                    ForEach(0..<24, id: \.self) { hour in
                        let quiet = selection.isQuiet(hour: hour)
                        RoundedRectangle(cornerRadius: 4, style: .continuous)
                            .fill(quiet ? DeskTheme.buttonBlue : PrefsInk.barIdle)
                            .frame(height: quiet ? 34 : 14)
                    }
                }
                .frame(height: 34, alignment: .bottom)
                .animation(.easeInOut(duration: 0.25), value: selection)
                HStack {
                    ForEach(["00", "06", "12", "18", "24"], id: \.self) { label in
                        Text(label)
                            .deskText(PrefsType.axis)
                            .foregroundStyle(PrefsInk.secondary)
                        if label != "24" { Spacer() }
                    }
                }
            }
            .environment(\.layoutDirection, .leftToRight)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("أوقات الهدوء على مدار اليوم")
            .accessibilityValue(rangeLabel)

            HStack(spacing: 8) {
                ForEach(presets, id: \.0) { preset, label in
                    let selected = preset == selection
                    Button { pick(preset) } label: {
                        Text(label)
                            .deskText(PrefsType.chip)
                            .foregroundStyle(selected ? Color.white : DeskInk.strong)
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .background(selected ? DeskTheme.navy : DeskTheme.chipGrey, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(selected ? .isSelected : [])
                }
            }

            Text("ما يصل في هذه الساعات يصلك بصمت، بلا صوت ولا إضاءة للشاشة، وتجده في مركز الإشعارات.")
                .deskText(PrefsType.hint)
                .foregroundStyle(PrefsInk.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 18)
        .padding(.top, 18)
        .padding(.bottom, 16)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private var rangeLabel: String {
        guard let window = selection.window else { return "متوقفة" }
        return PushKind.hourLabel(window.start) + " – " + PushKind.hourLabel(window.end)
    }
}

private struct KindRow: View {
    let kind: PushKind
    @Binding var isOn: Bool

    var body: some View {
        Toggle(isOn: $isOn) {
            HStack(spacing: 12) {
                icon
                    .frame(width: 40, height: 40)
                    .background(kind.tint, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(kind.title)
                        .deskText(PrefsType.rowTitle)
                        .foregroundStyle(DeskInk.strong)
                    Text(kind.hint)
                        .deskText(PrefsType.hint)
                        .foregroundStyle(PrefsInk.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .toggleStyle(DeskSwitchStyle())
        .padding(.vertical, 14)
    }

    @ViewBuilder private var icon: some View {
        switch kind {
        case .writerMessages:
            Image(systemName: "bubble.left").font(.system(size: 18, weight: .medium)).foregroundStyle(kind.ink)
        case .socialProposals:
            Text(verbatim: "X").font(.system(size: 18, weight: .bold)).foregroundStyle(kind.ink)
        case .adminAlerts:
            Image(systemName: "exclamationmark.triangle").font(.system(size: 17, weight: .medium)).foregroundStyle(kind.ink)
        case .aiAlerts:
            Image(systemName: "cpu").font(.system(size: 18, weight: .medium)).foregroundStyle(kind.ink)
        }
    }
}

/// 52×32 switch: Sabq button blue when on, soft grey when off.
private struct DeskSwitchStyle: ToggleStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 12) {
            configuration.label
            Spacer(minLength: 8)
            Capsule()
                .fill(configuration.isOn ? DeskTheme.buttonBlue : PrefsInk.switchOff)
                .frame(width: 52, height: 32)
                .overlay(alignment: configuration.isOn ? .trailing : .leading) {
                    Circle()
                        .fill(Color.white)
                        .frame(width: 26, height: 26)
                        .shadow(color: DeskTheme.navy.opacity(0.2), radius: 1, y: 1)
                        .padding(3)
                }
                .environment(\.layoutDirection, .leftToRight)
                .animation(.easeInOut(duration: 0.18), value: configuration.isOn)
                .accessibilityHidden(true)
        }
        .contentShape(Rectangle())
        .onTapGesture { configuration.isOn.toggle() }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
        .accessibilityValue(configuration.isOn ? "مفعّل" : "متوقف")
        .accessibilityAction { configuration.isOn.toggle() }
    }
}

private struct PushPreview: View {
    let text: String

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Text("س")
                .deskText(PrefsType.rowTitle)
                .foregroundStyle(Color.white)
                .frame(width: 36, height: 36)
                .background(DeskTheme.buttonBlue, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                HStack {
                    Text("مكتب سبق")
                        .deskText(PrefsType.previewName)
                        .foregroundStyle(DeskInk.strong)
                    Spacer()
                    Text("الآن")
                        .deskText(PrefsType.hint)
                        .foregroundStyle(PrefsInk.secondary)
                }
                Text(text)
                    .deskText(PrefsType.preview)
                    .foregroundStyle(DeskInk.strong)
                    .fixedSize(horizontal: false, vertical: true)
                    .contentTransition(.opacity)
                    .animation(.easeInOut(duration: 0.2), value: text)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(Color.white.opacity(0.75), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(PrefsInk.previewOutline, lineWidth: 1))
        .accessibilityElement(children: .combine)
    }
}

#if DEBUG
#Preview("التنبيهات") {
    NavigationStack { NotificationPrefsView() }
        .deskPreviewEnvironment()
}
#endif

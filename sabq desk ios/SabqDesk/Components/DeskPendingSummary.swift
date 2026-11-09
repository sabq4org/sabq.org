import SabqDeskDesign
import SwiftUI

/// «بانتظارك الآن» على الرئيسية: الإجمالي في الأعلى وتحته خانة لكل نوع يراه
/// العضو (تغريدات، مقالات رأي، رسائل). الخانات أعمدة داخل البطاقة نفسها.
struct DeskPendingSummaryCard: View {
    struct Cell: Identifiable, Equatable {
        let id: String
        let label: String
        let count: Int
    }

    let total: String
    let cells: [Cell]
    var note: String?
    var noteValue: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .center, spacing: 14) {
                Image(systemName: "tray.full")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(DeskInk.action)
                    .frame(width: 52, height: 52)
                    .background(Color.white, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .shadow(color: DeskInk.action.opacity(0.14), radius: 8, y: 2)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text("بانتظارك الآن")
                        .deskText(DeskType.meta)
                        .foregroundStyle(DeskTheme.textSecondary)
                    Text(verbatim: total)
                        .deskText(DeskHomeType.heroValue)
                        .foregroundStyle(DeskTheme.textPrimary)
                        .monospacedDigit()
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                }
                Spacer(minLength: 0)
                if let note, let noteValue {
                    VStack(spacing: 2) {
                        Text(note)
                            .deskText(DeskType.tag)
                            .foregroundStyle(DeskTheme.textSecondary)
                        LTRText(text: noteValue, role: DeskType.sectionHeading, color: DeskInk.link)
                    }
                    .padding(.horizontal, DeskLayout.space12)
                    .padding(.vertical, DeskLayout.space8)
                    .background(Color.white.opacity(0.75), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
            }
            .accessibilityElement(children: .combine)

            if cells.count > 1 {
                HStack(spacing: 0) {
                    ForEach(Array(cells.enumerated()), id: \.element.id) { index, cell in
                        if index > 0 {
                            Rectangle()
                                .fill(DeskInk.action.opacity(0.18))
                                .frame(width: 1, height: 30)
                                .accessibilityHidden(true)
                        }
                        cellView(cell)
                    }
                }
                .padding(.vertical, 10)
                .background(Color.white.opacity(0.75), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(colors: [DeskTheme.heroStart, DeskTheme.heroEnd],
                           startPoint: .topLeading, endPoint: .bottomTrailing),
            in: RoundedRectangle(cornerRadius: DeskRadius.large, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: DeskRadius.large, style: .continuous)
            .strokeBorder(Color.white, lineWidth: 1))
    }

    private func cellView(_ cell: Cell) -> some View {
        VStack(spacing: 2) {
            Text(verbatim: "\(cell.count)")
                .font(DeskFonts.app(size: 20, weight: .bold, relativeTo: .title3))
                .monospacedDigit()
                .foregroundStyle(cell.count > 0 ? DeskTheme.textPrimary : DeskTheme.textTertiary)
            Text(cell.label)
                .deskText(DeskType.tag)
                .foregroundStyle(DeskTheme.textSecondary)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(cell.label): \(cell.count)")
    }
}

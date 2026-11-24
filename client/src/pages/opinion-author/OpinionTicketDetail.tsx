// استفسار واحد: نفس صفحة «استفساراتي» مع تحديد الاستفسار (قائمة + محادثة).
import { useRoute } from "wouter";
import OpinionTicketsList from "./OpinionTicketsList";

export default function OpinionTicketDetail() {
  const [, params] = useRoute("/dashboard/opinion-author/tickets/:id");
  return <OpinionTicketsList selectedId={params?.id} />;
}

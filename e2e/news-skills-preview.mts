import { createNewsSkillsPreview } from "./news-skills-server";

await createNewsSkillsPreview(4178);
console.log("Local synthetic news fixture: http://127.0.0.1:4178/news?data=demo");

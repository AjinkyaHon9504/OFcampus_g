import { route } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { importCsv } from "@/lib/importer";

export const maxDuration = 60;

export const POST = route(async (user, req) => {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Upload a CSV file as 'file'");
  return importCsv(user.id, await file.text());
});

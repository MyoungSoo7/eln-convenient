import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ForbiddenPage() {
  const { t } = useTranslation("common");

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-6 text-center">
      <div className="p-4 rounded-full bg-destructive/10">
        <Lock className="h-10 w-10 text-destructive" />
      </div>
      <h1 className="text-xl font-bold">{t("error.forbiddenPage.title")}</h1>
      <p className="text-muted-foreground max-w-md">
        {t("error.forbiddenPage.message")}
      </p>
      <Link to="/">
        <Button variant="outline" className="mt-2">
          {t("error.forbiddenPage.home")}
        </Button>
      </Link>
    </div>
  );
}

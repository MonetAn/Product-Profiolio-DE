import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { MascotMessageScreen } from "@/components/MascotMessageScreen";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <MascotMessageScreen
      title="Упс, такой страницы нет"
      description="Возможно, ссылка устарела или вы перешли по неверному адресу."
      action={
        <Button variant="outline" asChild>
          <Link to="/">На главную</Link>
        </Button>
      }
    />
  );
};

export default NotFound;

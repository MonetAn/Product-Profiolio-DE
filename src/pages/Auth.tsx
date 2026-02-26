import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';

export default function Auth() {
  const { user, loading, signInWithGoogle, isDodoEmployee, signOut } = useAuth();
  const navigate = useNavigate();

  // Redirect if already authenticated with valid domain
  useEffect(() => {
    if (!loading && user && isDodoEmployee) {
      navigate('/');
    }
  }, [user, loading, isDodoEmployee, navigate]);

  const handleGoogleSignIn = async () => {
    const { error } = await signInWithGoogle();
    if (error) {
      toast.error('Ошибка входа: ' + error.message);
    }
  };

  const handleSignOut = async () => {
    await signOut();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // User is logged in but not with dodobrands.io email
  if (user && !isDodoEmployee) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Доступ запрещён</CardTitle>
            <CardDescription>
              Только для сотрудников Dodo Brands
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Вы вошли как <strong>{user.email}</strong>, но этот email не принадлежит домену @dodobrands.io.
              </AlertDescription>
            </Alert>
            <p className="text-sm text-muted-foreground text-center">
              Пожалуйста, войдите с корпоративным аккаунтом @dodobrands.io
            </p>
            <Button 
              onClick={handleSignOut}
              variant="outline" 
              className="w-full"
            >
              Выйти и попробовать снова
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Product Portfolio</CardTitle>
          <CardDescription>
            Войдите с корпоративным аккаунтом Dodo Brands
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button 
            onClick={handleGoogleSignIn}
            className="w-full flex items-center gap-3"
            size="lg"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Войти через Google
          </Button>
          
          <p className="text-xs text-muted-foreground text-center">
            Только для аккаунтов @dodobrands.io
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

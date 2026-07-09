import { motion } from 'framer-motion';
import { ShieldX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

const Unauthorized = () => (
  <div className="flex min-h-screen items-center justify-center bg-background p-4">
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center space-y-6 max-w-sm">
      <ShieldX className="h-20 w-20 text-destructive mx-auto" />
      <h1 className="text-3xl font-bold text-foreground">403 – Access Denied</h1>
      <p className="text-muted-foreground">You don't have permission to view this page. Contact an administrator if you believe this is an error.</p>
      <Button asChild className="lift-glow">
        <Link to="/">Go Home</Link>
      </Button>
    </motion.div>
  </div>
);

export default Unauthorized;

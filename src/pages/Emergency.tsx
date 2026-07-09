import { motion } from 'framer-motion';
import { Phone, MapPin, AlertTriangle, Shield, Heart, Stethoscope, Baby, Brain } from 'lucide-react';
import { type LucideIcon } from 'lucide-react';

interface Helpline {
  name: string;
  number: string;
  desc: string;
  icon: LucideIcon;
  iconClass: string;
  bgClass: string;
}

const helplines: Helpline[] = [
  { name: 'National Emergency', number: '112', desc: 'Police, Fire, Ambulance', icon: AlertTriangle, iconClass: 'text-destructive', bgClass: 'bg-destructive/10' },
  { name: 'Ambulance Service', number: '108', desc: 'Free emergency ambulance', icon: Heart, iconClass: 'text-destructive', bgClass: 'bg-destructive/10' },
  { name: 'Health Helpline', number: '104', desc: 'Health information & advice', icon: Stethoscope, iconClass: 'text-primary', bgClass: 'bg-primary/10' },
  { name: 'Women Helpline', number: '181', desc: 'Women in distress', icon: Shield, iconClass: 'text-secondary', bgClass: 'bg-secondary/10' },
  { name: 'Child Helpline', number: '1098', desc: 'Children in need', icon: Baby, iconClass: 'text-accent', bgClass: 'bg-accent/10' },
  { name: 'Mental Health', number: '08046110007', desc: 'iCall — counseling support', icon: Brain, iconClass: 'text-secondary', bgClass: 'bg-secondary/10' },
  { name: 'Poison Control', number: '1800-11-6117', desc: 'National Poison Information', icon: AlertTriangle, iconClass: 'text-destructive', bgClass: 'bg-destructive/10' },
  { name: 'Blood Bank', number: '1910', desc: 'Centralized blood bank info', icon: Heart, iconClass: 'text-destructive', bgClass: 'bg-destructive/10' },
];

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } };

const Emergency = () => (
  <div className="p-3 sm:p-4 md:p-8 max-w-3xl mx-auto space-y-5 sm:space-y-6">
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-foreground">Emergency</h1>
      <p className="mt-1 text-xs sm:text-sm md:text-base text-muted-foreground">Tap to call — available 24×7 across India</p>
    </motion.div>

    {/* SOS Button */}
    <motion.a href="tel:112"
      initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}
      whileTap={{ scale: 0.95 }}
      className="block rounded-2xl bg-gradient-to-br from-destructive to-destructive/80 p-6 sm:p-8 text-center text-destructive-foreground shadow-xl shadow-destructive/20 transition-transform relative overflow-hidden"
    >
      <div className="absolute inset-0 bg-gradient-to-t from-destructive/0 to-destructive-foreground/5" />
      <div className="relative z-10">
        <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-3xl bg-destructive-foreground/15 flex items-center justify-center mx-auto mb-3 sm:mb-4 relative">
          <Phone className="h-8 w-8 sm:h-10 sm:w-10" />
          <span className="absolute inset-0 rounded-3xl bg-destructive-foreground/10 animate-ping" />
        </div>
        <p className="text-2xl sm:text-3xl font-black tracking-tight">SOS — Call 112</p>
        <p className="text-xs sm:text-sm opacity-80 mt-1.5 sm:mt-2 font-medium">Tap for immediate emergency help</p>
      </div>
    </motion.a>

    {/* Helplines */}
    <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
      {helplines.map((h) => (
        <motion.a key={h.number} href={`tel:${h.number}`} variants={item}
          whileTap={{ scale: 0.97 }}
          className="rounded-xl border border-border bg-card p-3 sm:p-4 flex items-center gap-3 sm:gap-4 hover:border-primary/30 hover:shadow-md transition-all duration-300"
        >
          <div className={`h-10 w-10 sm:h-12 sm:w-12 rounded-xl ${h.bgClass} flex items-center justify-center shrink-0`}>
            <h.icon className={`h-4 w-4 sm:h-5 sm:w-5 ${h.iconClass}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-foreground text-xs sm:text-sm">{h.name}</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">{h.desc}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-base sm:text-lg font-extrabold text-primary">{h.number}</p>
          </div>
        </motion.a>
      ))}
    </motion.div>

    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
      className="text-center text-[10px] sm:text-xs text-muted-foreground flex items-center justify-center gap-1.5 py-2 sm:py-3">
      <MapPin className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> Valid across India • For local helplines, contact your nearest PHC
    </motion.p>
  </div>
);

export default Emergency;

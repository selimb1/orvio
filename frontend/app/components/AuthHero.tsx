"use client";

import { motion } from 'motion/react';
import { Circle } from 'lucide-react';

interface AuthHeroProps {
  title: string;
  subtitle: string;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.2,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5 },
  },
};

export default function AuthHero({ title, subtitle }: AuthHeroProps) {
  return (
    <div className="hidden lg:flex relative flex-col items-center justify-end pb-32 px-12 rounded-3xl overflow-hidden shadow-2xl h-full w-[52%] bg-black">
      {/* Video de fondo — sin máscaras ni superposiciones */}
      <video
        autoPlay
        muted
        loop
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
      >
        <source
          src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260506_081238_406ed0e3-5d83-436e-a512-0bbff7ec5b95.mp4"
          type="video/mp4"
        />
      </video>

      {/* Contenido animado con stagger */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="z-10 w-full max-w-xs space-y-8"
      >
        {/* Marca / Logo */}
        <motion.div variants={itemVariants} className="flex items-center gap-2">
          <Circle className="fill-white text-white w-6 h-6" />
          <span className="text-xl font-semibold tracking-tight">Orvio</span>
        </motion.div>

        {/* Encabezado dinámico */}
        <motion.h1
          variants={itemVariants}
          className="text-4xl font-medium tracking-tight"
        >
          {title}
        </motion.h1>

        {/* Subtítulo dinámico */}
        <motion.p
          variants={itemVariants}
          className="text-white/60 text-sm leading-relaxed px-4"
        >
          {subtitle}
        </motion.p>
      </motion.div>
    </div>
  );
}

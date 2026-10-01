import { motion, useReducedMotion } from 'framer-motion'

// One scroll reveal, used everywhere, so the whole page moves with one rhythm.
// Honours prefers-reduced-motion by rendering the content still rather than by
// running a shorter animation.
export default function Reveal({ children, delay = 0, y = 18 }) {
  const still = useReducedMotion()
  if (still) return <div>{children}</div>
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.55, delay, ease: [0.22, 0.61, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

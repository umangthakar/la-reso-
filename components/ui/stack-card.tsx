import * as motion from "motion/react-client"
import type { Variants } from "motion/react"
import Image from "next/image"
import Link from "next/link"
import type { Product } from "@/lib/data"

export function ScrollTriggered({ products }: { products: Product[] }) {
    return (
        <div
            style={container}
            className="grid grid-cols-1 justify-items-center gap-6 sm:grid-cols-2 lg:grid-cols-4"
        >
            {products.map((product, i) => (
                <Card product={product} i={i} key={product.id} />
            ))}
        </div>
    )
}

interface CardProps {
    product: Product
    i: number
}

function Card({ product, i }: CardProps) {
    return (
        <motion.div
            className={`card-container-${i}`}
            style={cardContainer}
            initial="offscreen"
            whileInView="onscreen"
            viewport={{ amount: 0.1 }}
        >
            <motion.div style={card} variants={cardVariants} className="card">
                {/* Product image — top 55% of the card, object-cover */}
                <div className="relative h-[55%] w-full overflow-hidden">
                    <Image
                        src={product.image}
                        alt={product.name}
                        fill
                        sizes="380px"
                        className="object-cover"
                    />
                </div>

                {/* Card body */}
                <div className="flex flex-1 flex-col p-5">
                    <span className="text-xs uppercase tracking-widest text-[#873853]">
                        {product.category}
                    </span>
                    <h3 className="mt-1.5 text-xl font-bold leading-snug text-[#612437]">
                        {product.name}
                    </h3>
                    <p className="mt-2 line-clamp-2 text-sm text-[#9C616D]">
                        {product.description}
                    </p>

                    <div className="mt-auto flex items-center justify-between pt-4">
                        <span className="text-xl font-bold text-[#612437]">
                            £{product.price.toFixed(2)}
                        </span>
                        <Link
                            href="/contact"
                            className="rounded-full bg-[#873853] px-5 py-2 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5"
                        >
                            Order
                        </Link>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    )
}

const cardVariants: Variants = {
    offscreen: { y: 300 },
    onscreen: {
        y: 0,
        rotate: 0,
        transition: { type: "spring", bounce: 0.4, duration: 0.8 },
    },
}

const container: React.CSSProperties = {
    margin: "0 auto",
    maxWidth: 1200,
    paddingBottom: 100,
    width: "100%",
}

const cardContainer: React.CSSProperties = {
    overflow: "hidden",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
    paddingTop: 0,
    paddingBottom: 0,
    marginBottom: 0,
}

const card: React.CSSProperties = {
    width: 280,
    height: 420,
    display: "flex",
    flexDirection: "column",
    borderRadius: 20,
    background: "#FFFFFF",
    boxShadow:
        "0 0 1px hsl(0deg 0% 0% / 0.075), 0 0 2px hsl(0deg 0% 0% / 0.075), 0 0 4px hsl(0deg 0% 0% / 0.075), 0 0 8px hsl(0deg 0% 0% / 0.075), 0 0 16px hsl(0deg 0% 0% / 0.075)",
    transformOrigin: "10% 60%",
    overflow: "hidden",
}

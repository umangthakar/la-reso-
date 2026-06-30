export type Category = {
  name: string;
  slug: string;
  image: string;
  blurb: string;
};

export type Product = {
  id: string;
  name: string;
  category: string;
  price: number;
  image: string;
  tag?: string;
  description: string;
};

const u = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=80`;

export const categories: Category[] = [
  {
    name: "Birthday Cakes",
    slug: "birthday-cakes",
    image: u("photo-1535141192574-5d4897c12636"),
    blurb: "Showstoppers for every wish",
  },
  {
    name: "Cupcakes",
    slug: "cupcakes",
    image: u("photo-1486427944299-d1955d23e34d"),
    blurb: "Little bites of joy",
  },
  {
    name: "Custom Cakes",
    slug: "custom-cakes",
    image: u("photo-1578985545062-69928b1d9587"),
    blurb: "Dreamed up just for you",
  },
  {
    name: "Brownies",
    slug: "brownies",
    image: u("photo-1607478900766-efe13248b125"),
    blurb: "Fudgy, gooey, dreamy",
  },
  {
    name: "Cookies",
    slug: "cookies",
    image: u("photo-1499636136210-6f4ee915583e"),
    blurb: "Crisp edges, soft centres",
  },
  {
    name: "Gift Boxes",
    slug: "gift-boxes",
    image: u("photo-1549007994-cb92caebd54b"),
    blurb: "Sweetness, beautifully wrapped",
  },
];

export const products: Product[] = [
  {
    id: "p1",
    name: "Rose Pistachio Celebration Cake",
    category: "Birthday Cakes",
    price: 48,
    image: u("photo-1578985545062-69928b1d9587"),
    tag: "Bestseller",
    description: "Three layers of rose-scented sponge, pistachio cream & dried petals.",
  },
  {
    id: "p2",
    name: "Vanilla Bean Buttercream Cupcakes",
    category: "Cupcakes",
    price: 18,
    image: u("photo-1486427944299-d1955d23e34d"),
    tag: "Box of 6",
    description: "Madagascar vanilla sponge crowned with silky swirls of buttercream.",
  },
  {
    id: "p3",
    name: "Salted Dark Chocolate Brownies",
    category: "Brownies",
    price: 22,
    image: u("photo-1607478900766-efe13248b125"),
    tag: "Fudgy",
    description: "Molten 70% chocolate centre finished with flaked sea salt.",
  },
  {
    id: "p4",
    name: "Strawberries & Cream Dream Cake",
    category: "Custom Cakes",
    price: 56,
    image: u("photo-1565958011703-44f9829ba187"),
    tag: "New",
    description: "Fresh strawberry compote layered with vanilla chantilly.",
  },
  {
    id: "p5",
    name: "Brown Butter Choc-Chip Cookies",
    category: "Cookies",
    price: 16,
    image: u("photo-1499636136210-6f4ee915583e"),
    tag: "Box of 8",
    description: "Nutty brown butter dough loaded with pools of chocolate.",
  },
  {
    id: "p6",
    name: "The Little Luxe Gift Box",
    category: "Gift Boxes",
    price: 34,
    image: u("photo-1549007994-cb92caebd54b"),
    tag: "Giftable",
    description: "A hand-tied box of cupcakes, cookies & brownie bites.",
  },
  {
    id: "p7",
    name: "Biscoff Caramel Layer Cake",
    category: "Birthday Cakes",
    price: 52,
    image: u("photo-1464349095431-e9a21285b5f3"),
    tag: "Bestseller",
    description: "Speculoos sponge, caramel drip & whipped Biscoff frosting.",
  },
  {
    id: "p8",
    name: "Red Velvet Heart Cupcakes",
    category: "Cupcakes",
    price: 20,
    image: u("photo-1614707267537-b85aaf00c4b7"),
    tag: "Box of 6",
    description: "Velvety cocoa sponge with tangy cream-cheese frosting.",
  },
  {
    id: "p9",
    name: "Triple Fudge Walnut Brownies",
    category: "Brownies",
    price: 24,
    image: u("photo-1606313564200-e75d5e30476c"),
    description: "Dense chocolate slab studded with toasted walnuts.",
  },
  {
    id: "p10",
    name: "Lemon & Elderflower Tier Cake",
    category: "Custom Cakes",
    price: 64,
    image: u("photo-1535254973040-607b474cb50d"),
    tag: "Wedding",
    description: "Bright citrus sponge with delicate elderflower buttercream.",
  },
  {
    id: "p11",
    name: "Double Choc Hazelnut Cookies",
    category: "Cookies",
    price: 18,
    image: u("photo-1558961363-fa8fdf82db35"),
    tag: "Box of 8",
    description: "Rich cocoa cookies with roasted hazelnut crunch.",
  },
  {
    id: "p12",
    name: "Festive Indulgence Hamper",
    category: "Gift Boxes",
    price: 58,
    image: u("photo-1607920592519-bab2a80ebf2f"),
    tag: "Limited",
    description: "An overflowing hamper of our seasonal sweet treasures.",
  },
];

export const featured = products.slice(0, 6);

export type Testimonial = {
  name: string;
  location: string;
  quote: string;
  avatar: string;
  rating: number;
};

export const testimonials: Testimonial[] = [
  {
    name: "Aisha Khan",
    location: "London",
    quote:
      "I genuinely could not tell it was eggless. The rose pistachio cake stole the show at my daughter's birthday — soft, moist and so beautiful.",
    avatar: u("photo-1438761681033-6461ffad8d80"),
    rating: 5,
  },
  {
    name: "Marcus Bennett",
    location: "Manchester",
    quote:
      "Ordered a custom cake for our anniversary and it arrived looking like art. The brownies are dangerously good too.",
    avatar: u("photo-1507003211169-0a1dd7228f2d"),
    rating: 5,
  },
  {
    name: "Priya Sharma",
    location: "Birmingham",
    quote:
      "Finally a bakery my whole family can enjoy together. Every box has been flawless, fresh and packed with love.",
    avatar: u("photo-1494790108377-be9c29b29330"),
    rating: 5,
  },
  {
    name: "Sofia Romano",
    location: "Leeds",
    quote:
      "The gift box was the highlight of my friend's birthday. Stunning packaging and the cupcakes were pure heaven.",
    avatar: u("photo-1534528741775-53994a69daeb"),
    rating: 5,
  },
];

export const whyEggless = [
  {
    title: "100% Eggless, Always",
    body: "Every recipe is crafted egg-free from the ground up — never an afterthought, never a compromise on taste.",
    icon: "Egg",
  },
  {
    title: "Inclusive by Design",
    body: "Vegetarian-friendly and perfect for celebrations where everyone deserves a slice of the cake.",
    icon: "Heart",
  },
  {
    title: "Lighter & Moister",
    body: "Our egg-free method locks in moisture, giving you a tender crumb that stays fresh for longer.",
    icon: "Sparkles",
  },
  {
    title: "Clean Ingredients",
    body: "Real butter, single-origin chocolate and seasonal fruit. Nothing you can't pronounce.",
    icon: "Leaf",
  },
];

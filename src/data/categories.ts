import categoryPool from "../../categoryPool.json";

export type CategoryPackId =
  | "classic"
  | "family"
  | "food-drink"
  | "entertainment"
  | "tricky";

export type CategoryPack = {
  categories: string[];
  id: CategoryPackId;
  name: string;
};

export const randomCategoryPool = categoryPool as string[];

export const categoryPacks: CategoryPack[] = [
  {
    id: "classic",
    name: "Classic",
    categories: [
      "Animal",
      "Country",
      "Fruit",
      "Vegetable",
      "Colour",
      "City",
      "Boy's name",
      "Girl's name",
      "Sport",
      "Job",
      "Movie",
      "TV show",
      "Book title",
      "Musical instrument",
      "Famous landmarks",
    ],
  },
  {
    id: "family",
    name: "Family",
    categories: [
      "Things you find in a kitchen",
      "Things you find in a bathroom",
      "Things you find in a garden",
      "Things you wear on your feet",
      "Things you take on holiday",
      "Things that make you laugh",
      "Something you do at a party",
      "Ways to travel",
      "Board game",
      "School subject",
      "Pets",
      "Breakfast food",
      "Things at a birthday party",
      "Things you find in a park",
      "Things you can recycle",
    ],
  },
  {
    id: "food-drink",
    name: "Food & Drink",
    categories: [
      "Fruit",
      "Vegetable",
      "Breakfast food",
      "Dessert",
      "Pizza topping",
      "Sandwich filling",
      "Ice cream flavour",
      "Type of cheese",
      "Type of bread",
      "Type of pasta",
      "Type of soup",
      "Foods you eat with your hands",
      "Foods at a barbecue",
      "Takeaway foods",
      "Things at a coffee shop",
    ],
  },
  {
    id: "entertainment",
    name: "Entertainment",
    categories: [
      "Action films",
      "Animated films",
      "Board game",
      "Card game",
      "Cartoon character",
      "Disney character",
      "Famous actors",
      "Famous band",
      "Famous musicians",
      "Movie",
      "Musical instrument",
      "Reality TV shows",
      "Romantic films",
      "Sitcoms",
      "Video game",
    ],
  },
  {
    id: "tricky",
    name: "Tricky",
    categories: [
      "Things that come in pairs",
      "Things that glow in the dark",
      "Things that have buttons",
      "Things that have stripes",
      "Things that have wheels",
      "Things that smell good",
      "Things that taste sweet",
      "Things you keep secret",
      "Movies with a number in the title",
      "Songs with a colour in the title",
      "Things that are see-through",
      "Things that are slippery",
      "Things with handles",
      "Things with strings",
      "Weather phenomena",
    ],
  },
];

export function getCategoryPack(packId: string | undefined) {
  return categoryPacks.find((pack) => pack.id === packId) ?? categoryPacks[0];
}

// Platform catalog verified at fribench_ops 964c0ba2357810506ba4d9e883d217f377ea0615.
const v1 = 'cat-unbothered shiba-sleepy capybara-zen goose-furious frog-dramatic penguin-serious bench-chill chair-boss stool-brave folding-chair-shy desk-grumpy sofa-lazy ultraman-confident stallone-tough popcorn-director cosmic-worker godzilla-grumpy save-crystal lich-king-chill mushroom-scholar arcade-jellyfish cape-snail creeper-awkward doubao-friendly deepseek-whale gpt-companion kimi-moon nailong-smug kangaroo-feidudu niulai-sideeye chiikawa-shy puppy-line snow-king'.split(' ');
const v2 = 'cat-unbothered shiba-sleepy capybara-zen goose-furious frog-dramatic penguin-serious pet-eleven pet-yuanbao pet-manman ultraman-confident stallone-tough godzilla-grumpy sunwukong-king nezha-brave baisuzhen-calm optimus-steady lich-king-chill creeper-awkward wilson-curious brotato-bold xiaoqiao-cheerful timmy-little masterchief-steady cuphead-cheeky doubao-friendly deepseek-whale gpt-companion kimi-moon nailong-smug kangaroo-feidudu niulai-sideeye chiikawa-shy puppy-line snow-king naiwa-thoughtful'.split(' ');
const versions: Record<string, string[]> = { v1, v2, v3: 'cat-unbothered shiba-sleepy capybara-zen goose-furious frog-dramatic penguin-serious pet-eleven pet-yuanbao pet-manman ultraman-confident stallone-tough godzilla-grumpy sunwukong-king nezha-brave optimus-steady terminator-cool baldqiang-grin ggbond-goofy lich-king-chill creeper-awkward wilson-curious brotato-bold xiaoqiao-cheerful timmy-little masterchief-steady cuphead-cheeky lara-adventurer doubao-friendly nailong-smug kangaroo-feidudu niulai-sideeye chiikawa-shy snow-king naiwa-thoughtful banana-cat-crying'.split(' ') };
export const avatarChoices = versions.v3!.map(id=>({id,url:`https://auth.fribench.cn/assets/avatars/v3/${id}.webp`}));
/** Stable catalog identity across legacy image versions; never rewrites stored image URLs. */
export function avatarIdentity(picture: unknown): string | undefined {
  const url=trustedAvatar(picture);
  return url?.split('/').at(-1)?.replace(/\.webp$/, '');
}
export function avatarSelectionUrl(picture: string): string {
  return avatarChoices.find(choice=>choice.id===avatarIdentity(picture))?.url??picture;
}
export function trustedAvatar(picture: unknown): string | undefined {
  if (typeof picture !== 'string') return;
  // Exact serialization also rejects normalized dot paths, escaped IDs and ports.
  const match = /^https:\/\/auth\.fribench\.cn\/assets\/avatars\/(v[123])\/([a-z0-9-]+)\.webp$/.exec(picture);
  return match && versions[match[1]!]!.includes(match[2]!) ? picture : undefined;
}

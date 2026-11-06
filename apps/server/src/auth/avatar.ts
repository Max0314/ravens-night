// Platform catalog verified at fribench_ops c68ad6fe75cefda72958a36e8778c119b00458e9.
const v1 = 'cat-unbothered shiba-sleepy capybara-zen goose-furious frog-dramatic penguin-serious bench-chill chair-boss stool-brave folding-chair-shy desk-grumpy sofa-lazy ultraman-confident stallone-tough popcorn-director cosmic-worker godzilla-grumpy save-crystal lich-king-chill mushroom-scholar arcade-jellyfish cape-snail creeper-awkward doubao-friendly deepseek-whale gpt-companion kimi-moon nailong-smug kangaroo-feidudu niulai-sideeye chiikawa-shy puppy-line snow-king'.split(' ');
const v2 = [...v1, ...'pet-eleven pet-yuanbao pet-manman sunwukong-king nezha-brave baisuzhen-calm optimus-steady wilson-curious brotato-bold xiaoqiao-cheerful timmy-little masterchief-steady cuphead-cheeky naiwa-thoughtful'.split(' ')];
const versions: Record<string, string[]> = { v1, v2, v3: [...v2, ...'lara-adventurer terminator-cool baldqiang-grin ggbond-goofy banana-cat-crying'.split(' ')] };
export function trustedAvatar(picture: unknown): string | undefined {
  if (typeof picture !== 'string') return;
  // Exact serialization also rejects normalized dot paths, escaped IDs and ports.
  const match = /^https:\/\/auth\.fribench\.cn\/assets\/avatars\/(v[123])\/([a-z0-9-]+)\.webp$/.exec(picture);
  return match && versions[match[1]!]!.includes(match[2]!) ? picture : undefined;
}

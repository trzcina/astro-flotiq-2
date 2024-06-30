import { k as createComponent, l as renderTemplate, m as maybeRenderHead, u as unescapeHTML } from './astro/server_BeafNdae.mjs';
import 'kleur/colors';
import 'clsx';
import { f as flotiq } from './flotiq_DO6PIzks.mjs';

const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  const products = await flotiq.ProductAPI.list();
  return renderTemplate`<html lang="en"> <title>Products</title>${maybeRenderHead()}<body> <h1>My products list</h1> ${products?.data?.map((product) => renderTemplate`<section> <h2>${product.name}</h2> <div>${product.price}</div> <div>${unescapeHTML(product.description)}</div> </section>`)} </body></html>`;
}, "/home/michal/projects/astro-flotiq-2/src/pages/index.astro", void 0);

const $$file = "/home/michal/projects/astro-flotiq-2/src/pages/index.astro";
const $$url = "";

export { $$Index as default, $$file as file, $$url as url };

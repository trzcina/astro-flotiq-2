import { k as createComponent, l as renderTemplate, m as maybeRenderHead, u as unescapeHTML, o as createAstro } from './astro/server_BeafNdae.mjs';
import 'kleur/colors';
import 'clsx';
import { f as flotiq } from './flotiq_DO6PIzks.mjs';

const $$Astro = createAstro();
const $$slug = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$slug;
  const { slug } = Astro2.params;
  let product;
  const findProductsResponse = await flotiq.ProductAPI.list({
    filters: JSON.stringify({
      slug: {
        type: "equals",
        filter: slug
      }
    }),
    limit: 1
  });
  if (findProductsResponse?.data?.[0]) {
    product = findProductsResponse?.data?.[0];
  } else {
    return Astro2.redirect("/404");
  }
  return renderTemplate` <title>${product.name}</title> ${maybeRenderHead()}<h1>${product.name}</h1> <div>${product.price}</div> <div>${unescapeHTML(product.description)}</div> `;
}, "/home/michal/projects/astro-flotiq-2/src/pages/products/[slug].astro", void 0);

const $$file = "/home/michal/projects/astro-flotiq-2/src/pages/products/[slug].astro";
const $$url = "/products/[slug]";

export { $$slug as default, $$file as file, $$url as url };

// Detección de género por nombre — fallback cuando NEUS_GENERO no está en BD.
// Usado por el estado de baño (color rosa/azul y clave hombres/mujeres).
const NOMBRES_F = new Set([
  'ana','maria','lucia','laura','sofia','valentina','andrea','alejandra','monica',
  'gabriela','patricia','rosa','carmen','isabel','veronica','adriana','claudia',
  'diana','fernanda','jessica','karla','leticia','luz','martha','nancy','norma',
  'paola','rebeca','silvia','susana','teresa','vanessa','yolanda','brenda','celia',
  'daniela','elena','esperanza','fabiola','gloria','graciela','irene','janeth',
  'josefina','karina','liliana','lorena','magdalena','marisol','miriam','nadia',
  'olivia','perla','rocio','sandra','tania','wendy','xochitl','yarely','zulema',
  'alicia','amalia','aurora','beatriz','blanca','cecilia','consuelo','cristina',
  'dolores','edith','elsa','emma','esther','eugenia','eva','fatima','flor','griselda',
  'guadalupe','hilda','ingrid','ivonne','jacqueline','lourdes','luisa','margarita',
  'mariana','maricela','mariela','marina','marlene','marta','mercedes','natalia',
  'noemi','nora','ofelia','pilar','raquel','reyna','ruth','sarai','selena','sheila',
  'stefania','stephanie','thalia','ximena','ines','jazmin','america','danna','erika',
  'itzel','ivana','lizbeth','mayte','melanie','michelle','mirna','nallely','nayeli',
  'pamela','priscila','valeria','viviana','yesenia','bertha','abigail','dayana',
  'yatziri','cherry','isabela','naomi','haydee','angeles',
  'dafne','sarahi','angelica','camila','alondra','araceli','ariana','ashley',
  'astrid','bianca','celeste','citlali','cynthia','dulce','esmeralda','fanny',
  'genesis','giselle','ilse','imelda','iris','isela','jimena','joanna','judith',
  'karen','katerine','keila','kenia','lesly','lilia','lina','lisette','lizeth',
  'liz','lucero','lupita','mabel','marcela','mayra','monserrat','montserrat',
  'myrna','nathaly','nidia','nohemi','odette','paulina','renata','rosario',
  'ruby','samantha','sara','socorro','soledad','sonia','soraya','tamara',
  'tatiana','trinidad','violeta','virginia','xitlali','yahaira','yazmin',
  'yesica','yuridia','zaira','midory','michel','marilyn','maricruz','katherine','cindy',
])

export function detectarGenero(nombre: string): 'M' | 'F' {
  const primer = (nombre ?? '').trim().split(/\s+/)[0].toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (NOMBRES_F.has(primer)) return 'F'
  const sinDup = primer.replace(/(\w)\1+$/, '$1')
  if (NOMBRES_F.has(sinDup)) return 'F'
  if (primer.endsWith('a') && primer.length > 3) return 'F'
  return 'M'
}

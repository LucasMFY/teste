import poolText from '../../pokemons_feitos.txt?raw';
import {buildPool} from './random';
import type {Pool} from './random';

/** O arquivo entra no app na hora do build (funciona offline). Ao editá-lo, rode o build/dev de novo. */
let cached: Pool | null = null;
export const randomPool = (): Pool => (cached ??= buildPool(poolText));

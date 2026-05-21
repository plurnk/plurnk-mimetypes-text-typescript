import { Parser, Token, type TokenStream } from "antlr4ng";
import { TypeScriptParser } from "./TypeScriptParser.ts";

/**
 * Helpers referenced from TypeScriptParser.g4 — predicate methods used by
 * grammar rules. Ported from the upstream antlr4-based reference base to
 * antlr4ng. Key API differences:
 *   - `this._input` → `this.inputStream` (antlr4ng getter)
 *   - `Token.text` is `string | undefined`; null-check before use
 *   - imports of generated classes use named exports (not default)
 */
export default abstract class TypeScriptParserBase extends Parser {
    constructor(input: TokenStream) {
        super(input);
    }

    protected p(str: string): boolean {
        return this.prev(str);
    }

    protected prev(str: string): boolean {
        return this.inputStream.LT(-1)?.text === str;
    }

    protected n(str: string): boolean {
        return this.next(str);
    }

    protected next(str: string): boolean {
        return this.inputStream.LT(1)?.text === str;
    }

    protected notLineTerminator(): boolean {
        return !this.here(TypeScriptParser.LineTerminator);
    }

    protected notOpenBraceAndNotFunctionAndNotInterface(): boolean {
        const nextTokenType = this.inputStream.LT(1)?.type;
        return (
            nextTokenType !== TypeScriptParser.OpenBrace &&
            nextTokenType !== TypeScriptParser.Function_ &&
            nextTokenType !== TypeScriptParser.Interface
        );
    }

    protected closeBrace(): boolean {
        return this.inputStream.LT(1)?.type === TypeScriptParser.CloseBrace;
    }

    private here(type: number): boolean {
        const possibleIndexEosToken = this.getCurrentToken().tokenIndex - 1;
        const ahead = this.inputStream.get(possibleIndexEosToken);
        return ahead.channel === Token.HIDDEN_CHANNEL && ahead.type === type;
    }

    protected lineTerminatorAhead(): boolean {
        let possibleIndexEosToken = this.getCurrentToken().tokenIndex - 1;
        let ahead = this.inputStream.get(possibleIndexEosToken);

        if (ahead.channel !== Token.HIDDEN_CHANNEL) return false;
        if (ahead.type === TypeScriptParser.LineTerminator) return true;

        if (ahead.type === TypeScriptParser.WhiteSpaces) {
            possibleIndexEosToken = this.getCurrentToken().tokenIndex - 2;
            ahead = this.inputStream.get(possibleIndexEosToken);
        }

        const text = ahead.text ?? "";
        const type = ahead.type;
        return (
            (type === TypeScriptParser.MultiLineComment && (text.includes("\r") || text.includes("\n"))) ||
            type === TypeScriptParser.LineTerminator
        );
    }
}

import { AntlrExtractor, withExtractor } from "@plurnk/plurnk-mimetypes";
import type { ExtractionVisitor } from "@plurnk/plurnk-mimetypes";
import { CharStream, CommonTokenStream } from "antlr4ng";
import { TypeScriptLexer } from "./generated/TypeScriptLexer.ts";
import { TypeScriptParser } from "./generated/TypeScriptParser.ts";
import { TypeScriptParserVisitor } from "./generated/TypeScriptParserVisitor.ts";

// text/typescript and text/javascript handler. The TypeScript ANTLR grammar
// handles plain JS as a subset, so one parser serves both mimetypes; the
// framework constructs separate handler instances with each registration's
// metadata, and `this.mimetype` distinguishes them where it matters
// (extraction policy is identical for both — TS-specific constructs like
// `interface` and `type` simply don't appear in JS source).
export default class TextTypescript extends AntlrExtractor {
    protected parseTree(content: string): unknown {
        const lexer = new TypeScriptLexer(CharStream.fromString(content));
        const tokens = new CommonTokenStream(lexer);
        const parser = new TypeScriptParser(tokens);
        parser.removeErrorListeners();
        return parser.program();
    }

    protected createVisitor(): ExtractionVisitor {
        return new TextTypescriptVisitor() as unknown as ExtractionVisitor;
    }
}

// Visitor: extends the antlr4ng-generated TypeScriptParserVisitor through
// the framework's `withExtractor` mixin, which adds `symbols`/`inBody`/
// `addSymbol`/`gateBody` for symbol collection.
//
// Inclusion policy follows SPEC §3:
//   - Top-level functions, classes, interfaces, enums, type aliases, namespaces.
//   - Class members (methods, getters/setters, fields, constructors) inside
//     a class — included because they're the class's API surface.
//   - Exported variables/constants at module scope.
//   - Excluded: imports, locals inside function bodies, function calls.
class TextTypescriptVisitor extends withExtractor(TypeScriptParserVisitor) {
    #inExport = false;

    visitFunctionBody = (ctx: any): null => this.gateBody(ctx);

    visitFunctionDeclaration = (ctx: any): null => {
        if (this.inBody) return null;
        const id = ctx.identifier();
        if (id) {
            const params = extractCallSignatureParams(ctx.callSignature?.());
            this.addSymbol("function", id.getText(), ctx, params);
        }
        this.visitChildren(ctx);
        return null;
    };

    visitGeneratorFunctionDeclaration = (ctx: any): null => {
        if (this.inBody) return null;
        const id = ctx.identifier();
        if (id) {
            const params = extractFormalParams(ctx.formalParameterList?.());
            this.addSymbol("function", id.getText(), ctx, params);
        }
        this.visitChildren(ctx);
        return null;
    };

    visitClassDeclaration = (ctx: any): null => {
        if (this.inBody) return null;
        const id = ctx.identifier();
        if (id) this.addSymbol("class", id.getText(), ctx);
        this.visitChildren(ctx);
        return null;
    };

    visitClassExpression = (ctx: any): null => {
        if (this.inBody) return null;
        const id = ctx.identifier?.();
        if (id) this.addSymbol("class", id.getText(), ctx);
        this.visitChildren(ctx);
        return null;
    };

    visitInterfaceDeclaration = (ctx: any): null => {
        if (this.inBody) return null;
        const id = ctx.identifier();
        if (id) this.addSymbol("interface", id.getText(), ctx);
        return null;
    };

    visitTypeAliasDeclaration = (ctx: any): null => {
        if (this.inBody) return null;
        const id = ctx.identifier();
        if (id) this.addSymbol("type", id.getText(), ctx);
        return null;
    };

    visitEnumDeclaration = (ctx: any): null => {
        if (this.inBody) return null;
        const id = ctx.identifier();
        if (id) this.addSymbol("enum", id.getText(), ctx);
        return null;
    };

    visitNamespaceDeclaration = (ctx: any): null => {
        if (this.inBody) return null;
        const name = ctx.namespaceName?.();
        if (name) this.addSymbol("module", name.getText(), ctx);
        this.visitChildren(ctx);
        return null;
    };

    visitConstructorDeclaration = (ctx: any): null => {
        const params = extractFormalParams(ctx.formalParameterList?.());
        this.addSymbol("method", "constructor", ctx, params);
        this.visitChildren(ctx);
        return null;
    };

    visitMethodDeclarationExpression = (ctx: any): null => {
        const name = ctx.propertyName?.()?.getText();
        if (name) {
            const params = extractCallSignatureParams(ctx.callSignature?.());
            this.addSymbol("method", name, ctx, params);
        }
        this.visitChildren(ctx);
        return null;
    };

    visitGetterSetterDeclarationExpression = (ctx: any): null => {
        const getter = ctx.getAccessor?.();
        const setter = ctx.setAccessor?.();
        const name =
            getter?.getter?.()?.classElementName?.()?.getText() ??
            setter?.setter?.()?.classElementName?.()?.getText();
        if (name) {
            const params = setter
                ? extractFormalParams(setter.formalParameterList?.())
                : [];
            this.addSymbol("method", name, ctx, params);
        }
        this.visitChildren(ctx);
        return null;
    };

    visitPropertyDeclarationExpression = (ctx: any): null => {
        const name = ctx.propertyName?.()?.getText();
        if (!name) return null;
        // ANTLR grammar quirk: some modifier keywords occasionally surface as
        // propertyName matches; skip them to avoid spurious symbols.
        if (name === "async" || name === "static" || name === "get" || name === "set") {
            return null;
        }
        this.addSymbol("field", name, ctx);
        return null;
    };

    visitImportStatement = (_ctx: any): null => {
        // Imports are dependency, not definition — excluded per SPEC §3.
        return null;
    };

    visitSourceElement = (ctx: any): null => {
        if (ctx.Export?.()) {
            const was = this.#inExport;
            this.#inExport = true;
            this.visitChildren(ctx);
            this.#inExport = was;
            return null;
        }
        this.visitChildren(ctx);
        return null;
    };

    visitExportDeclaration = (ctx: any): null => {
        const was = this.#inExport;
        this.#inExport = true;
        this.visitChildren(ctx);
        this.#inExport = was;
        return null;
    };

    visitExportDefaultDeclaration = (ctx: any): null => {
        this.visitChildren(ctx);
        return null;
    };

    visitVariableStatement = (ctx: any): null => {
        if (this.inBody) return null;
        // Only emit module-scope variables that are exported — unexported ones
        // are confirmed invisible outside the file per SPEC §3.
        if (!this.#inExport) return null;
        const declList = ctx.variableDeclarationList?.();
        if (!declList) return null;
        const decls = declList.variableDeclaration?.() ?? [];
        for (const decl of decls) {
            const id = decl.identifierOrKeyWord?.();
            if (id) this.addSymbol("variable", id.getText(), decl);
        }
        this.visitChildren(ctx);
        return null;
    };
}

function extractFormalParams(formalParameterList: any): string[] {
    if (!formalParameterList) return [];
    const params: string[] = [];
    const args = formalParameterList.formalParameterArg?.() ?? [];
    for (const arg of args) {
        const assignable = arg.assignable?.();
        const id = assignable?.identifier?.()?.getText() ?? assignable?.getText();
        if (id) params.push(id);
    }
    const rest = formalParameterList.lastFormalParameterArg?.();
    if (rest) params.push(`...${rest.identifier()?.getText()}`);
    return params;
}

function extractParams(parameterList: any): string[] {
    if (!parameterList) return [];
    const params: string[] = [];
    const paramNodes = parameterList.parameter?.() ?? [];
    for (const param of paramNodes) {
        const required = param.requiredParameter?.();
        const optional = param.optionalParameter?.();
        const node = required ?? optional;
        if (!node) continue;
        const iop = node.identifierOrPattern?.();
        const name =
            iop?.identifierName?.()?.getText() ??
            iop?.bindingPattern?.()?.getText();
        if (name) params.push(name);
    }
    const rest = parameterList.restParameter?.();
    if (rest) params.push(`...${rest.singleExpression()?.getText()}`);
    return params;
}

function extractCallSignatureParams(callSignature: any): string[] {
    if (!callSignature) return [];
    return extractParams(callSignature.parameterList?.());
}

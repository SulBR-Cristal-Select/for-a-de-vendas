/*
 * Adaptador do Combobox DS0.9.0; licença do componente original:
 * MIT License
 *
 * Copyright (c) 2026 Gestão 4.0 (G4 Educação)
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
import { Combobox as BaseCombobox } from "@base-ui/react/combobox";
import {
  Combobox,
  cn,
  fullWidthPositionerClass,
  normalize,
  useControlLabel,
  usePortalContainer,
  type ComboboxOption,
} from "@g4ai/ds";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import type { ComponentProps } from "react";

export type ERPMatches = {
  query: string;
  ids: ReadonlySet<string>;
  onSearchChange?: (query: string) => void;
  loading?: boolean;
  error?: string | undefined;
  onOpenChange?: (open: boolean) => void;
};
type Props = ComponentProps<typeof Combobox> & { remote?: ERPMatches | undefined };
type SingleProps = Extract<Props, { multiple?: false }> & { remote: ERPMatches };

export function matchesERPOption(
  option: ComboboxOption,
  query: string,
  remote: ERPMatches,
): boolean {
  const needle = normalize(query.trim());
  // Somente a página da consulta vigente pode confirmar um resultado remoto.
  // Registros fixados e cadastros manuais continuam sujeitos ao filtro normal.
  return (
    (needle !== "" && needle === normalize(remote.query.trim()) && remote.ids.has(option.value)) ||
    normalize(`${option.label} ${option.description ?? ""}`).includes(needle)
  );
}

/** Adaptador local: corrige apenas a filtragem das três consultas ERP do pedido. */
export function ERPCombobox({ remote, ...props }: Props) {
  if (!remote || props.multiple) return <Combobox {...props} />;
  return <RemoteSingle {...props} remote={remote} />;
}

// Estrutura, classes e textos do Combobox DS0.9.0 preservados; sem alterar o pacote.
// Baseado no componente MIT ©2026 Gestão4.0 (G4 Educação).
function RemoteSingle(props: SingleProps) {
  const {
    options,
    label,
    placeholder = "Selecione…",
    disabled,
    required,
    name,
    className,
    presentation = "auto",
    value,
    onValueChange,
    remote,
  } = props;
  const [portalRef, container] = usePortalContainer();
  const field = useControlLabel(props);
  return field.wrap(
    <BaseCombobox.Root<ComboboxOption>
      items={options}
      onOpenChange={(open) => remote.onOpenChange?.(open)}
      onInputValueChange={(query, details) => {
        if (["input", "change", "compositionend"].includes(details.event.type))
          remote.onSearchChange?.(query);
      }}
      value={options.find((option) => option.value === value) ?? null}
      onValueChange={(next) => onValueChange(next?.value ?? "")}
      isItemEqualToValue={(a, b) => a.value === b.value}
      filter={(option, query) => matchesERPOption(option, query, remote)}
      disabled={disabled}
      required={required}
      name={name}
      autoHighlight
    >
      <BaseCombobox.Trigger
        ref={portalRef}
        id={field.id}
        aria-label={label}
        aria-describedby={field.describedBy}
        aria-invalid={field.invalid || undefined}
        className={cn(
          "flex min-w-0 items-center justify-between gap-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:bg-soft/60 disabled:text-muted",
          className ??
            cn(
              "h-10 w-full rounded-lg border bg-surface px-3 text-[14px]",
              field.invalid ? "border-rose/50" : "border-line hover:border-line-strong",
            ),
        )}
      >
        <span className="truncate">
          <BaseCombobox.Value placeholder={placeholder} />
        </span>
        <ChevronsUpDown aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted" />
      </BaseCombobox.Trigger>
      <BaseCombobox.Portal container={container}>
        <BaseCombobox.Positioner
          align="start"
          sideOffset={5}
          collisionPadding={12}
          className={cn(
            "z-[100] max-w-[calc(100vw-16px)]",
            presentation === "auto" && fullWidthPositionerClass,
          )}
        >
          <BaseCombobox.Popup
            aria-label={label}
            className="flex max-h-[min(360px,var(--available-height))] w-[max(240px,var(--anchor-width))] max-w-[calc(100vw-16px)] flex-col overflow-hidden rounded-xl border border-line bg-popover text-ink shadow-xl shadow-black/10"
          >
            <div className="focus-field flex shrink-0 items-center gap-2 border-b border-line px-3">
              <Search aria-hidden className="h-4 w-4 shrink-0 text-muted" />
              <BaseCombobox.Input
                aria-label={`Buscar em ${label.toLocaleLowerCase("pt-BR")}`}
                placeholder="Buscar…"
                className="h-11 w-full min-w-0 border-0 bg-transparent text-[14px] outline-none placeholder:text-muted"
              />
            </div>
            <BaseCombobox.Empty>
              <div className="p-5 text-center text-[13px] text-muted">
                {remote.loading ? "Carregando…" : remote.error || "Nenhum resultado encontrado."}
              </div>
            </BaseCombobox.Empty>
            <BaseCombobox.List className="min-h-0 overflow-y-auto overscroll-contain p-1.5 outline-none empty:p-0">
              {(option: ComboboxOption) => (
                <BaseCombobox.Item
                  key={option.value}
                  value={option}
                  disabled={option.disabled}
                  className="flex cursor-default items-center gap-3 rounded-lg px-2.5 py-2 text-[14px] outline-none data-highlighted:bg-soft data-disabled:cursor-not-allowed data-disabled:text-muted max-sm:min-h-11"
                >
                  <div className="min-w-0 flex-1">
                    <div className="break-words">{option.label}</div>
                    {option.description && (
                      <div className="mt-0.5 text-[12px] text-muted">{option.description}</div>
                    )}
                  </div>
                  <BaseCombobox.ItemIndicator>
                    <Check aria-hidden className="h-4 w-4 shrink-0 text-ink" />
                  </BaseCombobox.ItemIndicator>
                </BaseCombobox.Item>
              )}
            </BaseCombobox.List>
          </BaseCombobox.Popup>
        </BaseCombobox.Positioner>
      </BaseCombobox.Portal>
    </BaseCombobox.Root>,
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Loader2, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useObraStatus } from "@/hooks/useObraStatus";
import { useToast } from "@/hooks/use-toast";
import {
  createStatusId,
  getProgressStatusBadgeVariant,
  getProgressStatusLabel,
  getProgressStatusTone,
  recomputeObraStatus,
} from "@/lib/obraStatus";
import { cn } from "@/lib/utils";
import { ensureObraStatus, saveObraStatus } from "@/services/obraStatus.service";
import type {
  ObraStatusControlMode,
  ObraStatusData,
  ObraStatusEtapa,
} from "@/types/obraStatus";

interface UpdateActor {
  uid: string;
  nome: string;
}

interface StaffObraStatusTabProps {
  obraId: string;
  actor: UpdateActor;
}

const cloneStatus = (statusData: ObraStatusData | null | undefined) =>
  statusData
    ? recomputeObraStatus({
        ...statusData,
        etapas: statusData.etapas.map((etapa) => ({
          ...etapa,
          itens: etapa.itens.map((item) => ({ ...item })),
        })),
      })
    : null;

const reindexStatus = (statusData: ObraStatusData) =>
  recomputeObraStatus({
    ...statusData,
    etapas: statusData.etapas.map((etapa, etapaIndex) => ({
      ...etapa,
      ordem: etapaIndex + 1,
      itens: etapa.itens.map((item, itemIndex) => ({
        ...item,
        ordem: itemIndex + 1,
      })),
    })),
  });

const StaffObraStatusTab = ({ obraId, actor }: StaffObraStatusTabProps) => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: statusData, isLoading, error } = useObraStatus(obraId);
  const [expandedStages, setExpandedStages] = useState<Record<string, boolean>>({});
  const [editingStageId, setEditingStageId] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState<ObraStatusData | null>(null);
  const initializedExpanded = useRef(false);

  useEffect(() => {
    if (!obraId || !actor.uid) return;

    void ensureObraStatus(obraId, actor)
      .then((nextStatus) => {
        queryClient.setQueryData(["obraStatus", obraId], nextStatus);
      })
      .catch((currentError) => {
        if (import.meta.env.DEV) {
          console.error("[STATUS] falha ao inicializar statusObra", {
            obraId,
            error: currentError,
          });
        }
        toast({
          title: "Falha ao carregar status",
          description: "Nao foi possivel inicializar a estrutura da obra.",
          variant: "destructive",
        });
      });
  }, [actor, obraId, queryClient, toast]);

  useEffect(() => {
    if (editingStageId || !statusData) return;
    setDraftStatus(null);
  }, [editingStageId, statusData]);

  useEffect(() => {
    initializedExpanded.current = false;
    setExpandedStages({});
    setEditingStageId(null);
    setDraftStatus(null);
  }, [obraId]);

  const workingStatus = draftStatus ?? statusData ?? null;

  useEffect(() => {
    if (initializedExpanded.current || !workingStatus || workingStatus.etapas.length === 0) {
      return;
    }

    const nextExpanded: Record<string, boolean> = {};
    workingStatus.etapas.forEach((etapa) => {
      if (etapa.status === "em_andamento" || etapa.status === "finalizando") {
        nextExpanded[etapa.id] = true;
      }
    });
    setExpandedStages(nextExpanded);
    initializedExpanded.current = true;
  }, [workingStatus]);

  const saveMutation = useMutation({
    mutationFn: (payload: ObraStatusData) => saveObraStatus(obraId, payload, actor),
    onSuccess: (savedStatus) => {
      queryClient.setQueryData(["obraStatus", obraId], savedStatus);
      void queryClient.invalidateQueries({ queryKey: ["obra", obraId] });
      setDraftStatus(null);
      setEditingStageId(null);
      toast({ title: "Status salvo com sucesso" });
    },
    onError: (currentError) => {
      toast({
        title: "Falha ao salvar status",
        description:
          currentError instanceof Error ? currentError.message : "Erro inesperado.",
        variant: "destructive",
      });
    },
  });

  const stageCount = workingStatus?.etapas.length ?? 0;

  const updateDraft = (
    mutator: (current: ObraStatusData) => ObraStatusData,
    options?: { stageId?: string; forceEdit?: boolean },
  ) => {
    const baseStatus = cloneStatus(draftStatus ?? statusData);
    if (!baseStatus) return;

    const nextStatus = reindexStatus(mutator(baseStatus));
    setDraftStatus(nextStatus);
    if (options?.stageId) {
      setExpandedStages((current) => ({ ...current, [options.stageId as string]: true }));
    }
    if (options?.forceEdit && options.stageId) {
      setEditingStageId(options.stageId);
    }
  };

  const startEditing = (stageId: string) => {
    if (editingStageId && editingStageId !== stageId) {
      const shouldDiscard = window.confirm(
        "Descartar alteracoes nao salvas da etapa atual?",
      );
      if (!shouldDiscard) return;
    }

    const nextDraft = cloneStatus(statusData);
    if (!nextDraft) return;
    setDraftStatus(nextDraft);
    setEditingStageId(stageId);
    setExpandedStages((current) => ({ ...current, [stageId]: true }));
  };

  const cancelEditing = () => {
    setEditingStageId(null);
    setDraftStatus(null);
  };

  const addStage = () => {
    const currentStatus = cloneStatus(draftStatus ?? statusData);
    if (!currentStatus) return;

    if (editingStageId && !window.confirm("Descartar alteracoes nao salvas e criar nova etapa?")) {
      return;
    }

    const stageId = createStatusId("etapa");
    const nextStatus = reindexStatus({
      ...currentStatus,
      etapas: [
        ...currentStatus.etapas,
        {
          id: stageId,
          nome: "Nova etapa",
          ordem: currentStatus.etapas.length + 1,
          modoControle: "checklist",
          progresso: 0,
          status: "pendente",
          itens: [],
        },
      ],
    });

    setDraftStatus(nextStatus);
    setEditingStageId(stageId);
    setExpandedStages((current) => ({ ...current, [stageId]: true }));
  };

  const saveCurrentDraft = () => {
    if (!draftStatus) return;
    saveMutation.mutate(draftStatus);
  };

  const persistStageMutation = (
    stageId: string,
    mutator: (currentStage: ObraStatusEtapa) => ObraStatusEtapa,
  ) => {
    if (editingStageId === stageId) {
      updateDraft(
        (current) => ({
          ...current,
          etapas: current.etapas.map((currentStage) =>
            currentStage.id === stageId ? mutator(currentStage) : currentStage,
          ),
        }),
        { stageId },
      );
      return;
    }

    const currentStatus = cloneStatus(statusData);
    if (!currentStatus) return;

    const nextStatus = reindexStatus({
      ...currentStatus,
      etapas: currentStatus.etapas.map((currentStage) =>
        currentStage.id === stageId ? mutator(currentStage) : currentStage,
      ),
    });

    setDraftStatus(nextStatus);
    setExpandedStages((current) => ({ ...current, [stageId]: true }));
    saveMutation.mutate(nextStatus);
  };

  const updateStageControlMode = (
    stageId: string,
    modoControle: ObraStatusControlMode,
  ) => {
    persistStageMutation(stageId, (currentStage) => ({
      ...currentStage,
      modoControle,
    }));
  };

  const toggleChecklistItem = (
    stageId: string,
    itemId: string,
    checked: boolean,
  ) => {
    persistStageMutation(stageId, (currentStage) => ({
      ...currentStage,
      itens: currentStage.itens.map((currentItem) =>
        currentItem.id === itemId
          ? {
              ...currentItem,
              progresso: checked ? 100 : 0,
            }
          : currentItem,
      ),
    }));
  };

  const overallTone = useMemo(
    () => getProgressStatusTone(workingStatus?.progressoGeral === 100 ? "completo" : workingStatus?.progressoGeral ? "em_andamento" : "pendente"),
    [workingStatus?.progressoGeral],
  );

  if (isLoading && !workingStatus) {
    return <p className="text-sm text-muted-foreground">Carregando status da obra...</p>;
  }

  if (error && !workingStatus) {
    return (
      <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
        Nao foi possivel carregar o status da obra agora. Tente novamente em instantes.
      </div>
    );
  }

  if (!workingStatus) {
    return (
      <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
        Nenhum status configurado para esta obra.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-foreground">
              Progresso geral da obra
            </h3>
            <p className="text-sm text-muted-foreground">
              O progresso geral e calculado por media simples das etapas; cada etapa pode usar percentual informado ou checklist.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={addStage} disabled={saveMutation.isPending}>
              <Plus className="mr-2 h-4 w-4" /> Adicionar etapa
            </Button>
            {editingStageId ? (
              <Button variant="outline" onClick={cancelEditing} disabled={saveMutation.isPending}>
                <X className="mr-2 h-4 w-4" /> Cancelar
              </Button>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Progress
            value={workingStatus.progressoGeral}
            className="h-3"
            indicatorClassName={overallTone.indicatorClass}
          />
          <span className="min-w-14 text-right text-sm font-semibold">
            {workingStatus.progressoGeral}%
          </span>
        </div>
      </div>

      {stageCount === 0 ? (
        <div className="rounded-xl border border-dashed bg-muted/40 p-5 text-sm text-muted-foreground">
          Nenhuma etapa cadastrada. Use "Adicionar etapa" para iniciar.
        </div>
      ) : (
        workingStatus.etapas.map((etapa) => {
          const stageTone = getProgressStatusTone(etapa.status);
          const isOpen = expandedStages[etapa.id] ?? false;
          const isEditing = editingStageId === etapa.id;

          return (
            <Collapsible
              key={etapa.id}
              open={isOpen}
              onOpenChange={(nextOpen) =>
                setExpandedStages((current) => ({ ...current, [etapa.id]: nextOpen }))
              }
              className="rounded-xl border border-border/80 bg-muted/35 shadow-sm"
            >
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 rounded-xl p-4 text-left transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-foreground">{etapa.nome}</p>
                      <Badge variant={getProgressStatusBadgeVariant(etapa.status)}>
                        {getProgressStatusLabel(etapa.status)}
                      </Badge>
                      <Badge variant="outline">
                        {etapa.modoControle === "checklist" ? "Checklist" : "Barra de %"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {etapa.itens.length} itens
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <Progress
                        value={etapa.progresso}
                        className="h-2"
                        indicatorClassName={stageTone.indicatorClass}
                      />
                      <span className="min-w-12 text-right text-sm font-semibold">
                        {etapa.progresso}%
                      </span>
                    </div>
                  </div>

                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                      isOpen && "rotate-180",
                    )}
                  />
                </button>
              </CollapsibleTrigger>

              <CollapsibleContent className="border-t border-border/80 bg-background/80 p-4 space-y-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  {isEditing ? (
                    <Input
                      value={etapa.nome}
                      onChange={(event) =>
                        updateDraft(
                          (current) => ({
                            ...current,
                            etapas: current.etapas.map((currentStage) =>
                              currentStage.id === etapa.id
                                ? { ...currentStage, nome: event.target.value || "Nova etapa" }
                                : currentStage,
                            ),
                          }),
                          { stageId: etapa.id },
                        )
                      }
                      className="max-w-md"
                      placeholder="Nome da etapa"
                    />
                  ) : (
                    <div className="rounded-lg border border-border/70 bg-muted/45 px-3 py-2 text-sm text-muted-foreground">
                      Status derivado automaticamente pelo modo de acompanhamento da etapa.
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    {isEditing ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            updateDraft(
                              (current) => ({
                                ...current,
                                etapas: current.etapas.map((currentStage) =>
                                  currentStage.id === etapa.id
                                    ? {
                                        ...currentStage,
                                        itens: [
                                          ...currentStage.itens,
                                          {
                                            id: createStatusId("item"),
                                            nome: `Novo item ${currentStage.itens.length + 1}`,
                                            ordem: currentStage.itens.length + 1,
                                            progresso: 0,
                                            status: "pendente",
                                          },
                                        ],
                                      }
                                    : currentStage,
                                ),
                              }),
                              { stageId: etapa.id },
                            )
                          }
                          disabled={saveMutation.isPending}
                        >
                          <Plus className="mr-2 h-4 w-4" /> Adicionar item
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            if (!window.confirm(`Excluir a etapa "${etapa.nome}"?`)) return;
                            updateDraft(
                              (current) => ({
                                ...current,
                                etapas: current.etapas.filter(
                                  (currentStage) => currentStage.id !== etapa.id,
                                ),
                              }),
                            );
                            setEditingStageId(null);
                          }}
                          disabled={saveMutation.isPending}
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Excluir etapa
                        </Button>
                        <Button
                          size="sm"
                          onClick={saveCurrentDraft}
                          disabled={saveMutation.isPending}
                        >
                          {saveMutation.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="mr-2 h-4 w-4" />
                          )}
                          Salvar alteracoes
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => startEditing(etapa.id)}
                        disabled={saveMutation.isPending}
                      >
                        <Pencil className="mr-2 h-4 w-4" /> Editar etapa
                      </Button>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-2 rounded-lg border border-border/70 bg-muted/30 p-3 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">
                      Modo de acompanhamento
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Checklist calcula o percentual pelos itens concluidos; barra de % usa o percentual informado.
                    </p>
                  </div>
                  <Select
                    value={etapa.modoControle}
                    onValueChange={(value: ObraStatusControlMode) =>
                      updateStageControlMode(etapa.id, value)
                    }
                    disabled={saveMutation.isPending}
                  >
                    <SelectTrigger className="w-full md:w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="checklist">Checklist</SelectItem>
                      <SelectItem value="percentual">Barra de %</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3">
                  {etapa.itens.length === 0 ? (
                    <div className="rounded-lg border border-dashed bg-muted/45 p-3 text-sm text-muted-foreground">
                      Esta etapa ainda nao possui itens.
                    </div>
                  ) : (
                    etapa.itens.map((item) => {
                      const itemTone = getProgressStatusTone(item.status);

                      return (
                        <div
                          key={item.id}
                          className="rounded-xl border border-border/80 bg-card p-3 shadow-sm space-y-3"
                        >
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0 flex-1 space-y-2">
                              {isEditing ? (
                                <Input
                                  value={item.nome}
                                  onChange={(event) =>
                                    updateDraft(
                                      (current) => ({
                                        ...current,
                                        etapas: current.etapas.map((currentStage) =>
                                          currentStage.id === etapa.id
                                            ? {
                                                ...currentStage,
                                                itens: currentStage.itens.map((currentItem) =>
                                                  currentItem.id === item.id
                                                    ? {
                                                        ...currentItem,
                                                        nome:
                                                          event.target.value || "Novo item",
                                                      }
                                                    : currentItem,
                                                ),
                                              }
                                            : currentStage,
                                        ),
                                      }),
                                      { stageId: etapa.id },
                                    )
                                  }
                                  placeholder="Nome do item"
                                />
                              ) : (
                                <p className="text-sm font-medium text-foreground">
                                  {item.nome}
                                </p>
                              )}

                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant={getProgressStatusBadgeVariant(item.status)}>
                                  {getProgressStatusLabel(item.status)}
                                </Badge>
                                <span className={cn("text-xs", itemTone.textClass)}>
                                  {item.progresso}%
                                </span>
                              </div>
                            </div>

                            {isEditing ? (
                              <div className="flex items-center gap-2">
                                {etapa.modoControle === "checklist" ? (
                                  <div className="flex items-center gap-2 rounded-md border px-3 py-2">
                                    <Checkbox
                                      checked={item.progresso >= 100}
                                      onCheckedChange={(checked) =>
                                        toggleChecklistItem(
                                          etapa.id,
                                          item.id,
                                          checked === true,
                                        )
                                      }
                                      disabled={saveMutation.isPending}
                                    />
                                    <span className="text-sm text-muted-foreground">
                                      Concluido
                                    </span>
                                  </div>
                                ) : (
                                  <Input
                                    type="number"
                                    min={0}
                                    max={100}
                                    step={1}
                                    value={item.progresso}
                                    onChange={(event) =>
                                      updateDraft(
                                        (current) => ({
                                          ...current,
                                          etapas: current.etapas.map((currentStage) =>
                                            currentStage.id === etapa.id
                                              ? {
                                                  ...currentStage,
                                                  itens: currentStage.itens.map((currentItem) =>
                                                    currentItem.id === item.id
                                                      ? {
                                                          ...currentItem,
                                                          progresso: Number(event.target.value),
                                                        }
                                                      : currentItem,
                                                  ),
                                                }
                                              : currentStage,
                                          ),
                                        }),
                                        { stageId: etapa.id },
                                      )
                                    }
                                    className="w-24"
                                  />
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    if (!window.confirm(`Excluir o item "${item.nome}"?`)) return;
                                    updateDraft(
                                      (current) => ({
                                        ...current,
                                        etapas: current.etapas.map((currentStage) =>
                                          currentStage.id === etapa.id
                                            ? {
                                                ...currentStage,
                                                itens: currentStage.itens.filter(
                                                  (currentItem) => currentItem.id !== item.id,
                                                ),
                                              }
                                            : currentStage,
                                        ),
                                      }),
                                      { stageId: etapa.id },
                                    );
                                  }}
                                  disabled={saveMutation.isPending}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : etapa.modoControle === "checklist" ? (
                              <div className="flex items-center gap-2">
                                <Checkbox
                                  checked={item.progresso >= 100}
                                  onCheckedChange={(checked) =>
                                    toggleChecklistItem(
                                      etapa.id,
                                      item.id,
                                      checked === true,
                                    )
                                  }
                                  disabled={saveMutation.isPending}
                                />
                                <span className="text-sm font-semibold text-foreground">
                                  {item.progresso >= 100 ? "Concluido" : "Pendente"}
                                </span>
                              </div>
                            ) : (
                              <span className="text-sm font-semibold text-foreground">
                                {item.progresso}%
                              </span>
                            )}
                          </div>

                          <Progress
                            value={item.progresso}
                            className="h-2"
                            indicatorClassName={itemTone.indicatorClass}
                          />
                        </div>
                      );
                    })
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })
      )}
    </div>
  );
};

export default StaffObraStatusTab;

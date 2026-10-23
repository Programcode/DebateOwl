// src/pages/FlowchartPage.tsx
import { useCallback, useLayoutEffect, useMemo, useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import ReactFlow, {
    Node,
    Controls,
    ControlButton,
    Background,
    MiniMap,
    useNodesState,
    useEdgesState,
    addEdge,
    Connection,
    BackgroundVariant,
    Handle,
    Position,
    useReactFlow,
    useStore,
    useStoreApi,
    ReactFlowProvider,
    type FitViewOptions,
    type ReactFlowInstance,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useSessionStore, FlowchartData } from '@/lib/stores/session-store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import {
    Plus,
    Download,
    Trash2,
    GitBranch,
    Target,
    Swords,
    Shield,
    AlertTriangle,
    Save,
    FolderOpen,
    Clock,
    LayoutGrid,
    Minus,
    Maximize,
    Lock,
    Unlock,
    FileInput,
} from 'lucide-react';
import { toPng } from 'html-to-image';
import { formatRelativeDate } from '@/lib/date-format';
import { toast } from 'sonner';
import { CurrentDebateStrip } from '@/components/features/debate/CurrentDebateStrip';
import { useDebateStore } from '@/lib/stores/debate-store';
import { WorkspaceToolScope, useWorkspaceToolScope } from '@/components/features/workspace/WorkspaceToolScope';
import {
    caseHasFlowchart,
    edgeLabel,
    edgeOfKind,
    editNodeData,
    flowchartFromCase,
    nodeDescription,
    nodeLabel,
    starterFlowchart,
    studentNodeData,
    type EdgeKind,
    type FlowNodeData,
    type NodeType,
} from '@/lib/flowchart';

// Shades dark enough for white text at 4.5:1.
const nodeColors: Record<NodeType, { bg: string; border: string; text: string }> = {
    thesis: { bg: 'bg-primary', border: 'border-primary', text: 'text-primary-foreground' },
    contention: { bg: 'bg-emerald-700', border: 'border-emerald-700', text: 'text-white' },
    attack: { bg: 'bg-red-700', border: 'border-red-700', text: 'text-white' },
    rebuttal: { bg: 'bg-blue-700', border: 'border-blue-700', text: 'text-white' },
    dropped: { bg: 'bg-amber-700', border: 'border-amber-700', text: 'text-white' },
};

const nodeIcons: Record<NodeType, React.ReactNode> = {
    thesis: <Target className="h-4 w-4" />,
    contention: <Shield className="h-4 w-4" />,
    attack: <Swords className="h-4 w-4" />,
    rebuttal: <GitBranch className="h-4 w-4" />,
    dropped: <AlertTriangle className="h-4 w-4" />,
};

const strengthTranslationKeys = {
    strong: 'flowchart.strengthStrong',
    moderate: 'flowchart.strengthModerate',
    weak: 'flowchart.strengthWeak',
};

// React Flow 11 writes its keyboard help for nodes and edges, and the name of its
// attribution link, in English, with no prop to change them (v12's ariaLabelConfig
// has one). That text is static, so React never writes it again after mount; the
// translated text takes its place.
function LocalizedA11yDescriptions(): null {
    const { t } = useTranslation();
    const rfId = useStore((state) => state.rfId);
    const domNode = useStore((state) => state.domNode);
    useEffect(() => {
        const replace = (id: string, text: string) => {
            const element = document.getElementById(id);
            if (element && element.textContent !== text) element.textContent = text;
        };
        replace(`react-flow__node-desc-${rfId}`, t('flowchart.a11yNodeHelp'));
        replace(`react-flow__edge-desc-${rfId}`, t('flowchart.a11yEdgeHelp'));
        domNode?.querySelector('.react-flow__attribution a')?.setAttribute('aria-label', t('flowchart.attribution'));
    }, [rfId, domNode, t]);
    return null;
}

// React Flow's own control buttons have fixed English names, so the canvas
// renders the same four with translated ones.
function useCanvasControls() {
    const { t } = useTranslation();
    const { zoomIn, zoomOut, fitView } = useReactFlow();
    const store = useStoreApi();
    const isInteractive = useStore((state) => state.nodesDraggable || state.nodesConnectable || state.elementsSelectable);
    const minZoomReached = useStore((state) => state.transform[2] <= state.minZoom);
    const maxZoomReached = useStore((state) => state.transform[2] >= state.maxZoom);
    const toggleInteractivity = () => store.setState({
        nodesDraggable: !isInteractive,
        nodesConnectable: !isInteractive,
        elementsSelectable: !isInteractive,
    });
    return [
        { key: 'zoom-in', label: t('flowchart.zoomIn'), icon: <Plus />, onClick: () => zoomIn(), disabled: maxZoomReached },
        { key: 'zoom-out', label: t('flowchart.zoomOut'), icon: <Minus />, onClick: () => zoomOut(), disabled: minZoomReached },
        { key: 'fit', label: t('flowchart.fitView'), icon: <Maximize />, onClick: () => fitView(FIT_VIEW) },
        { key: 'lock', label: t('flowchart.toggleInteractivity'), icon: isInteractive ? <Unlock /> : <Lock />, onClick: toggleInteractivity, pressed: !isInteractive },
    ];
}

// Over the canvas from the small breakpoint up.
function LocalizedControls() {
    const controls = useCanvasControls();
    return (
        <Controls className="max-sm:!hidden" showZoom={false} showFitView={false} showInteractive={false}>
            {controls.map((control) => (
                <ControlButton
                    key={control.key}
                    onClick={control.onClick}
                    disabled={control.disabled}
                    title={control.label}
                    aria-label={control.label}
                    aria-pressed={control.pressed}
                >
                    {control.icon}
                </ControlButton>
            ))}
        </Controls>
    );
}

// On phones the canvas is too narrow to float controls over it without covering
// nodes, so the same buttons sit in a row under it.
function CanvasControlsBar() {
    const { t } = useTranslation();
    const controls = useCanvasControls();
    return (
        <div role="group" aria-label={t('flowchart.canvasControls')} className="flex gap-2 border-t p-2 sm:hidden">
            {controls.map((control) => (
                <Button
                    key={control.key}
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-11 w-11 [&_svg]:h-4 [&_svg]:w-4"
                    onClick={control.onClick}
                    disabled={control.disabled}
                    title={control.label}
                    aria-label={control.label}
                    aria-pressed={control.pressed}
                >
                    {control.icon}
                </Button>
            ))}
        </div>
    );
}

const FIT_VIEW: FitViewOptions = { padding: 0.2 };

// Toolbar buttons show only their icon on phones; the text stays as their name.
const COMPACT_LABEL = 'sr-only sm:not-sr-only';

// 12px handles get an invisible 44px hit area on touch.
// Edge labels get 24px-tall pills. The invisible stroke that takes an edge tap is sized
// in screen pixels in index.css, from the --flow-zoom the canvas sets below.
const EDGE_LABEL_PADDING: [number, number] = [8, 6];

const HANDLE_CLASS = "!bg-white/50 !w-3 !h-3 !border-2 !border-white/80 pointer-coarse:after:absolute pointer-coarse:after:-inset-4 pointer-coarse:after:content-['']";

// Custom node component
function CustomNode({ data }: { data: FlowNodeData }) {
    const { t } = useTranslation();
    const colors = nodeColors[data.type];
    const typeLabelKey = {
        thesis: 'flowchart.legendThesis',
        contention: 'flowchart.typeArgument',
        attack: 'flowchart.typeAttack',
        rebuttal: 'flowchart.typeRebuttal',
        dropped: 'flowchart.typeDropped',
    }[data.type];
    return (
        <div
            className={`px-4 py-3 shadow-lg rounded-lg border-2 ${colors.border} ${colors.bg} ${colors.text} min-w-[150px] max-w-[250px] relative`}
        >
            <Handle type="target" position={Position.Top} className={HANDLE_CLASS} />
            <div className="flex items-center gap-2 mb-1">
                {nodeIcons[data.type]}
                <Badge variant="secondary" className="text-xs uppercase border-current bg-transparent text-inherit hover:bg-transparent">
                    {t(typeLabelKey)}
                </Badge>
            </div>
            <div className="font-semibold text-sm">{nodeLabel(data, t)}</div>
            {nodeDescription(data, t) && (
                <div className="text-xs mt-1 line-clamp-2 whitespace-pre-line">{nodeDescription(data, t)}</div>
            )}
            {data.strength && (
                <Badge
                    variant="outline"
                    className={`mt-2 text-xs text-white ${data.strength === 'strong'
                        ? 'border-green-300'
                        : data.strength === 'weak'
                            ? 'border-red-300'
                            : 'border-yellow-300'
                        }`}
                >
                    {t(strengthTranslationKeys[data.strength])}
                </Badge>
            )}
            <Handle type="source" position={Position.Bottom} className={HANDLE_CLASS} />
        </div>
    );
}

const nodeTypes = {
    custom: CustomNode,
};

export default function FlowchartPage() {
    const workspace = useWorkspaceToolScope('flowchart');
    const { t } = useTranslation();
    const {
        pendingFlowchartData,
        setPendingFlowchartData,
        saveFlowchart,
        savedFlowcharts: allSavedFlowcharts,
        deleteSavedFlowchart,
        generateResult,
        generateResultDebateId,
    } = useSessionStore();
    // Saved flowcharts follow the Current Debate; one-off mode shows one-off flowcharts.
    const flowchartScope = useDebateStore((state) => state.oneOff ? null : state.currentDebateId);
    const savedFlowcharts = allSavedFlowcharts.filter((item) => (item.debateId ?? null) === flowchartScope);
    // The case on the Generate page, when it belongs to the same debate as these flowcharts.
    // A case restored before results recorded their debate is not offered.
    const currentCase = !workspace.context && caseHasFlowchart(generateResult) && generateResultDebateId !== undefined && generateResultDebateId === flowchartScope
        ? generateResult
        : null;

    const [starter] = useState(() => starterFlowchart(t));
    const [nodes, setNodes, onNodesChange] = useNodesState<FlowNodeData>(starter.nodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(starter.edges);
    // Screen readers name an edge by the nodes it joins, not by internal ids, and edge
    // labels follow the language. Only the canvas gets these; saved charts keep plain edges.
    // Keyed on ids and titles, so dragging a node does not rebuild every edge.
    const nodeTitlesKey = JSON.stringify(nodes.map((node) => [node.id, node.data ? nodeLabel(node.data, t) : '']));
    const nodeTitles = useMemo(() => new Map<string, string>(JSON.parse(nodeTitlesKey) as Array<[string, string]>), [nodeTitlesKey]);
    const labelledEdges = useMemo(() => edges.map((edge) => ({
        ...edge,
        labelBgPadding: EDGE_LABEL_PADDING,
        label: edgeLabel(edge, t),
        ariaLabel: t('flowchart.edgeAriaLabel', {
            source: nodeTitles.get(edge.source) || edge.source,
            target: nodeTitles.get(edge.target) || edge.target,
        }),
    })), [edges, nodeTitles, t]);

    // Save/Load dialog states
    const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
    const [saveTitle, setSaveTitle] = useState('');
    const [saveTitleError, setSaveTitleError] = useState(false);
    const saveTitleRef = useRef<HTMLInputElement>(null);
    const [isLoadDialogOpen, setIsLoadDialogOpen] = useState(false);

    // Each chart gets a fresh canvas, which fits it once its nodes have sizes.
    const [chartKey, setChartKey] = useState(0);
    const [flowInstance, setFlowInstance] = useState<ReactFlowInstance | null>(null);
    const flowInstanceRef = useRef<ReactFlowInstance | null>(null);
    flowInstanceRef.current = flowInstance;
    // The canvas changing width (a rotated phone, a resized window) fits the chart again.
    // A new chart remounts the canvas element, so the observer follows the key.
    const canvasRef = useRef<HTMLDivElement>(null);
    const canvasSize = useRef({ width: 0, height: 0 });
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        let frame = 0;
        const observer = new ResizeObserver(([entry]) => {
            const { width, height } = entry.contentRect;
            const widthChanged = canvasSize.current.width !== 0 && Math.round(canvasSize.current.width) !== Math.round(width);
            canvasSize.current = { width, height };
            // Only width: a phone's browser bar changes the height while scrolling.
            if (!widthChanged) return;
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => void flowInstanceRef.current?.fitView(FIT_VIEW));
        });
        observer.observe(canvas);
        return () => {
            observer.disconnect();
            cancelAnimationFrame(frame);
        };
    }, [chartKey]);

    // Node ids repeat across charts, so an Undo (a deleted node, a built case) belongs to
    // the chart it came from: loading another chart retires that Undo.
    const chartVersion = useRef(0);
    const undoToasts = useRef(new Set<string | number>());
    // The debate (null: one-off work) a loaded, imported, or built chart belongs to;
    // undefined while the canvas holds the template.
    const chartScope = useRef<string | null | undefined>(undefined);
    const currentScope = useRef(flowchartScope);
    useLayoutEffect(() => {
        currentScope.current = flowchartScope;
    }, [flowchartScope]);
    const replaceChart = useCallback((data: FlowchartData, scope: string | null | undefined = currentScope.current) => {
        chartVersion.current += 1;
        undoToasts.current.forEach((id) => toast.dismiss(id));
        undoToasts.current.clear();
        chartScope.current = scope;
        setNodes(data.nodes);
        setEdges(data.edges);
        setChartKey((key) => key + 1);
    }, [setNodes, setEdges]);

    useEffect(() => {
        if (pendingFlowchartData) {
            replaceChart(pendingFlowchartData);
            setPendingFlowchartData(null);
        }
    }, [pendingFlowchartData, replaceChart, setPendingFlowchartData]);

    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [newNodeLabel, setNewNodeLabel] = useState('');
    const [newNodeDescription, setNewNodeDescription] = useState('');
    const [newNodeType, setNewNodeType] = useState<NodeType>('contention');
    const [newNodeStrength, setNewNodeStrength] = useState<'strong' | 'moderate' | 'weak'>('moderate');
    const [newNodeLabelError, setNewNodeLabelError] = useState(false);
    const newNodeLabelRef = useRef<HTMLInputElement>(null);
    const [selectedNode, setSelectedNode] = useState<string | null>(null);
    const [layoutAnimating, setLayoutAnimating] = useState(false);
    const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
    const [selectedEdgeType, setSelectedEdgeType] = useState<EdgeKind>('support');

    const onConnect = useCallback(
        (connection: Connection) => {
            if (!connection.source || !connection.target) return;
            // addEdge names the edge after its endpoints and handles, and skips duplicates.
            const { label, data, style, markerEnd } = edgeOfKind(selectedEdgeType, connection.source, connection.target, t);
            setEdges((eds) => addEdge({ ...connection, label, data, style, markerEnd }, eds));
        },
        [selectedEdgeType, setEdges, t]
    );

    const handleSaveNode = useCallback(() => {
        if (!newNodeLabel.trim()) {
            setNewNodeLabelError(true);
            newNodeLabelRef.current?.focus();
            return;
        }

        if (editingNodeId) {
            setNodes((nds) =>
                nds.map((node) => {
                    if (node.id === editingNodeId) {
                        return {
                            ...node,
                            data: editNodeData(node.data, {
                                label: newNodeLabel,
                                description: newNodeDescription,
                                type: newNodeType,
                                strength: newNodeType === 'contention' ? newNodeStrength : undefined,
                            }, t),
                        };
                    }
                    return node;
                })
            );
            setEditingNodeId(null);
        } else {
            // A new node appears in the middle of what the user is looking at.
            const { width, height } = canvasSize.current;
            const viewport = flowInstance?.getViewport();
            const centre = viewport && width
                ? { x: (width / 2 - viewport.x) / viewport.zoom, y: (height / 2 - viewport.y) / viewport.zoom }
                : { x: 400, y: 250 };
            const newNode: Node<FlowNodeData> = {
                id: `node-${Date.now()}`,
                type: 'custom',
                position: { x: centre.x - 100, y: centre.y - 40 },
                data: studentNodeData({
                    label: newNodeLabel,
                    description: newNodeDescription,
                    type: newNodeType,
                    strength: newNodeType === 'contention' ? newNodeStrength : undefined,
                }),
            };
            setNodes((nds) => [...nds, newNode]);
        }

        setNewNodeLabel('');
        setNewNodeDescription('');
        setIsAddDialogOpen(false);
    }, [newNodeLabel, newNodeDescription, newNodeType, newNodeStrength, editingNodeId, setNodes, flowInstance, t]);

    const handleSaveFlowchart = async () => {
        if (!saveTitle.trim()) {
            setSaveTitleError(true);
            saveTitleRef.current?.focus();
            return;
        }

        try {
            await saveFlowchart(saveTitle, { nodes, edges }, workspace.context ? null : undefined);
            await workspace.attach({ title: saveTitle }, { nodes, edges });
            setIsSaveDialogOpen(false);
            setSaveTitle('');
            toast.success(t('flowchart.savedToast'));
        } catch (error) {
            toast.error(t('flowchart.saveFailedToast'));
            console.error(error);
        }
    };

    // Building from the case replaces the canvas, so Undo puts the previous chart back.
    const buildFromCase = () => {
        if (!currentCase) return;
        const previous = { nodes, edges };
        const previousScope = chartScope.current;
        replaceChart(flowchartFromCase(currentCase, t));
        setSelectedNode(null);
        const version = chartVersion.current;
        undoToasts.current.add(toast.success(t('flowchart.builtFromCase'), {
            action: {
                label: t('common.undo', 'Undo'),
                onClick: () => {
                    if (chartVersion.current !== version) return;
                    replaceChart(previous, previousScope);
                    setSelectedNode(null);
                },
            },
        }));
    };

    // A chart belongs to its debate: switching debates puts the template back rather
    // than leave that chart on the canvas, to be saved into another debate.
    useEffect(() => {
        if (chartScope.current === undefined || chartScope.current === flowchartScope) return;
        replaceChart(starterFlowchart(t), undefined);
        setSelectedNode(null);
        toast(t('flowchart.resetForDebate'));
    }, [flowchartScope, replaceChart, t]);

    const handleLoadFlowchart = (data: FlowchartData) => {
        replaceChart(data);
        setSelectedNode(null);
        setIsLoadDialogOpen(false);
        toast.success(t('flowchart.loadedToast'));
    };

    // A saved flowchart can be saved again exactly, so delete acts at once and offers Undo.
    // One delete per chart at a time: a second click while the first is in flight would
    // offer a second Undo, and two Undos would save two copies.
    const [deletingFlowchartIds, setDeletingFlowchartIds] = useState<ReadonlySet<string>>(new Set());
    const handleDeleteFlowchart = async (item: (typeof savedFlowcharts)[number], e: React.MouseEvent) => {
        e.stopPropagation();
        if (deletingFlowchartIds.has(item.id)) return;
        setDeletingFlowchartIds((ids) => new Set(ids).add(item.id));
        try {
            await deleteSavedFlowchart(item.id);
            toast(t('flowchart.deletedNamed', { title: item.title, defaultValue: 'Deleted {{title}}' }), {
                action: {
                    label: t('common.undo', 'Undo'),
                    onClick: () => {
                        void saveFlowchart(item.title, item.data, item.debateId ?? null)
                            .catch(() => toast.error(t('flowchart.restoreFailed', 'Could not restore the flowchart')));
                    },
                },
            });
        } catch {
            toast.error(t('flowchart.deleteFailedToast'));
        } finally {
            setDeletingFlowchartIds((ids) => {
                const next = new Set(ids);
                next.delete(item.id);
                return next;
            });
        }
    };

    const openAddDialog = () => {
        setEditingNodeId(null);
        setNewNodeLabelError(false);
        setNewNodeLabel('');
        setNewNodeDescription('');
        setNewNodeType('contention');
        setNewNodeStrength('moderate');
        setIsAddDialogOpen(true);
    };

    const openEditDialog = useCallback((node: Node<FlowNodeData>) => {
        setEditingNodeId(node.id);
        setNewNodeLabelError(false);
        setNewNodeLabel(nodeLabel(node.data, t));
        setNewNodeDescription(nodeDescription(node.data, t));
        setNewNodeType(node.data.type);
        if (node.data.strength) {
            setNewNodeStrength(node.data.strength);
        }
        setIsAddDialogOpen(true);
    }, [t]);

    // Deleting a node acts at once; Undo puts the node and its edges back.
    const deleteSelectedNode = useCallback(() => {
        if (!selectedNode || selectedNode === 'thesis') return;
        const removedNode = nodes.find((n) => n.id === selectedNode);
        if (!removedNode) return;
        const removedEdges = edges.filter((e) => e.source === selectedNode || e.target === selectedNode);
        setNodes((nds) => nds.filter((n) => n.id !== selectedNode));
        setEdges((eds) => eds.filter((e) => e.source !== selectedNode && e.target !== selectedNode));
        setSelectedNode(null);
        const version = chartVersion.current;
        const undo = toast(t('flowchart.nodeDeletedNamed', { label: nodeLabel(removedNode.data, t), defaultValue: 'Deleted {{label}}' }), {
            action: {
                label: t('common.undo', 'Undo'),
                onClick: () => {
                    if (chartVersion.current !== version) return;
                    setNodes((nds) => (nds.some((n) => n.id === removedNode.id) ? nds : [...nds, removedNode]));
                    setEdges((eds) => [...eds, ...removedEdges.filter((edge) => !eds.some((e) => e.id === edge.id))]);
                },
            },
        });
        undoToasts.current.add(undo);
    }, [selectedNode, nodes, edges, setNodes, setEdges, t]);

    const autoLayout = useCallback(() => {
        const lanes: Record<NodeType, number> = {
            thesis: 60,
            contention: 230,
            attack: 420,
            rebuttal: 610,
            dropped: 420,
        };
        const grouped = nodes.reduce((acc, node) => {
            const type = node.data.type;
            acc[type] = [...(acc[type] || []), node.id];
            return acc;
        }, {} as Record<NodeType, string[]>);

        // Nodes glide to their lanes (a transition only while laying out, so dragging stays direct),
        // and the view fits the result in step.
        setLayoutAnimating(true);
        setNodes((currentNodes) => currentNodes.map((node) => {
            const group = grouped[node.data.type] || [node.id];
            const index = group.indexOf(node.id);
            const spacing = node.data.type === 'thesis' ? 0 : 280;
            const x = 400 + (index - (group.length - 1) / 2) * spacing;
            return { ...node, position: { x, y: lanes[node.data.type] } };
        }));
        requestAnimationFrame(() => void flowInstance?.fitView({ duration: 250, padding: 0.2 }));
        window.setTimeout(() => setLayoutAnimating(false), 300);
    }, [nodes, setNodes, flowInstance]);

    const exportToPng = useCallback(() => {
        const flowElement = canvasRef.current?.querySelector<HTMLElement>('.react-flow');
        if (!flowElement) return;

        // The canvas size comes from its ResizeObserver, so exporting forces no layout.
        const background = getComputedStyle(document.documentElement).getPropertyValue('--background').trim();
        toPng(flowElement, {
            backgroundColor: background ? `hsl(${background})` : '#ffffff',
            width: Math.round(canvasSize.current.width),
            height: Math.round(canvasSize.current.height),
        }).then((dataUrl) => {
            const link = document.createElement('a');
            link.download = 'debate-flowchart.png';
            link.href = dataUrl;
            link.click();
        }).catch(() => {
            toast.error(t('flowchart.exportFailedToast', 'Could not export flowchart.'));
        });
    }, [t]);

    const stats = useMemo(() => {
        const counts = nodes.reduce(
            (acc, node) => {
                acc[node.data.type] = (acc[node.data.type] || 0) + 1;
                return acc;
            },
            {} as Record<NodeType, number>
        );
        return counts;
    }, [nodes]);

    return (
        <div className="container space-y-6 px-4 py-8">
            <WorkspaceToolScope context={workspace.context} />
            <PageHeader className="mb-0" title={t('flowchart.title')} />
            <Card>
                <CardHeader className="pb-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap gap-2">
                            {/* Load Dialog */}
                            <Dialog open={isLoadDialogOpen} onOpenChange={setIsLoadDialogOpen}>
                                <DialogTrigger asChild>
                                    <Button variant="outline" size="sm">
                                        <FolderOpen className="h-4 w-4 sm:mr-2" />
                                        <span className={COMPACT_LABEL}>{t('flowchart.load')}</span>
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-md">
                                    <DialogHeader>
                                        <DialogTitle>{t('flowchart.savedFlowcharts')}</DialogTitle>
                                        <DialogDescription>
                                            {t('flowchart.savedFlowchartsDesc')}
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-2 py-4 max-h-[60vh] overflow-y-auto">
                                        {savedFlowcharts.length === 0 ? (
                                            <div className="text-center py-8 text-muted-foreground">
                                                {t('flowchart.noSavedFlowcharts')}
                                            </div>
                                        ) : (
                                            savedFlowcharts.map((item) => (
                                                // Load and Delete are sibling buttons, not a button inside a clickable row,
                                                // so no click or key press on one can reach the other.
                                                <div
                                                    key={item.id}
                                                    className="flex items-center gap-2 rounded-lg border bg-card p-1 pr-2 transition-colors hover:bg-accent/50"
                                                >
                                                    <button
                                                        type="button"
                                                        className="min-w-0 flex-1 space-y-1 rounded-md p-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                        onClick={() => handleLoadFlowchart(item.data)}
                                                    >
                                                        <div className="font-medium break-words">{item.title}</div>
                                                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                                                            <Clock className="h-3 w-3" />
                                                            {formatRelativeDate(item.createdAt)}
                                                        </div>
                                                    </button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-9 w-9 shrink-0 text-destructive"
                                                        disabled={deletingFlowchartIds.has(item.id)}
                                                        onClick={(e) => {
                                                            void handleDeleteFlowchart(item, e);
                                                        }}
                                                        aria-label={t('flowchart.deleteNamed', { title: item.title, defaultValue: 'Delete {{title}}' })}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </DialogContent>
                            </Dialog>

                            {/* Save Dialog */}
                            <Dialog
                                open={isSaveDialogOpen}
                                onOpenChange={(open) => {
                                    setIsSaveDialogOpen(open);
                                    if (open) setSaveTitleError(false);
                                }}
                            >
                                <DialogTrigger asChild>
                                    <Button variant="outline" size="sm">
                                        <Save className="h-4 w-4 sm:mr-2" />
                                        <span className={COMPACT_LABEL}>{t('flowchart.save')}</span>
                                    </Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>{t('flowchart.saveFlowchartDialog')}</DialogTitle>
                                        <DialogDescription>{t('flowchart.saveFlowchartDialogDesc')}</DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-4 py-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="flowchart-save-title">{t('flowchart.titleField')}</Label>
                                            <Input
                                                id="flowchart-save-title"
                                                ref={saveTitleRef}
                                                placeholder={t('flowchart.titlePlaceholder')}
                                                value={saveTitle}
                                                aria-invalid={saveTitleError}
                                                aria-describedby={saveTitleError ? 'flowchart-save-title-error' : undefined}
                                                onChange={(e) => {
                                                    setSaveTitle(e.target.value);
                                                    if (saveTitleError) setSaveTitleError(false);
                                                }}
                                            />
                                            {saveTitleError && (
                                                <p id="flowchart-save-title-error" role="alert" className="text-sm text-destructive">
                                                    {t('flowchart.titleRequired')}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <DialogFooter>
                                        <Button onClick={handleSaveFlowchart}>{t('flowchart.saveFlowchart')}</Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>

                            <div className="w-px h-8 bg-border mx-1" aria-hidden="true" />

                            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                                <DialogTrigger asChild>
                                    <Button variant="outline" size="sm" onClick={openAddDialog}>
                                        <Plus className="h-4 w-4 mr-2" />
                                        {t('flowchart.addNode')}
                                    </Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>{editingNodeId ? t('flowchart.editNode') : t('flowchart.addNodeDialog')}</DialogTitle>
                                        <DialogDescription>{editingNodeId ? t('flowchart.editNodeDesc') : t('flowchart.addNodeDialogDesc')}</DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-4 py-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="flowchart-node-label">{t('flowchart.labelField')}</Label>
                                            <Input
                                                id="flowchart-node-label"
                                                ref={newNodeLabelRef}
                                                placeholder={t('flowchart.labelPlaceholder')}
                                                value={newNodeLabel}
                                                aria-invalid={newNodeLabelError}
                                                aria-describedby={newNodeLabelError ? 'flowchart-node-label-error' : undefined}
                                                onChange={(e) => {
                                                    setNewNodeLabel(e.target.value);
                                                    if (newNodeLabelError) setNewNodeLabelError(false);
                                                }}
                                            />
                                            {newNodeLabelError && (
                                                <p id="flowchart-node-label-error" role="alert" className="text-sm text-destructive">
                                                    {t('flowchart.labelRequired')}
                                                </p>
                                            )}
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="flowchart-node-description">{t('flowchart.descriptionField')}</Label>
                                            <Textarea
                                                id="flowchart-node-description"
                                                placeholder={t('flowchart.descPlaceholder')}
                                                value={newNodeDescription}
                                                onChange={(e) => setNewNodeDescription(e.target.value)}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label id="flowchart-node-type-label" htmlFor="flowchart-node-type">{t('flowchart.typeField')}</Label>
                                            <Select value={newNodeType} onValueChange={(v) => setNewNodeType(v as NodeType)}>
                                                <SelectTrigger id="flowchart-node-type" aria-labelledby="flowchart-node-type-label">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="contention">{t('flowchart.typeArgument')}</SelectItem>
                                                    <SelectItem value="attack">{t('flowchart.typeAttack')}</SelectItem>
                                                    <SelectItem value="rebuttal">{t('flowchart.typeRebuttal')}</SelectItem>
                                                    <SelectItem value="dropped">{t('flowchart.typeDropped')}</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        {newNodeType === 'contention' && (
                                            <div className="space-y-2">
                                                <Label id="flowchart-node-strength-label" htmlFor="flowchart-node-strength">{t('flowchart.strengthField')}</Label>
                                                <Select value={newNodeStrength} onValueChange={(v) => setNewNodeStrength(v as 'strong' | 'moderate' | 'weak')}>
                                                    <SelectTrigger id="flowchart-node-strength" aria-labelledby="flowchart-node-strength-label">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="strong">{t('flowchart.strengthStrong')}</SelectItem>
                                                        <SelectItem value="moderate">{t('flowchart.strengthModerate')}</SelectItem>
                                                        <SelectItem value="weak">{t('flowchart.strengthWeak')}</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        )}
                                    </div>
                                    <DialogFooter>
                                        <Button onClick={handleSaveNode}>{editingNodeId ? t('flowchart.saveChanges') : t('flowchart.addNode')}</Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>

                            <Select value={selectedEdgeType} onValueChange={(value) => setSelectedEdgeType(value as EdgeKind)}>
                                <SelectTrigger className="h-9 w-[132px]" aria-label={t('flowchart.edgeTypeLabel')}>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="support">{t('flowchart.edgeSupport', 'Support')}</SelectItem>
                                    <SelectItem value="attack">{t('flowchart.edgeAttack', 'Attack')}</SelectItem>
                                    <SelectItem value="rebuttal">{t('flowchart.edgeRebuttal', 'Rebuttal')}</SelectItem>
                                </SelectContent>
                            </Select>

                            <Button variant="outline" size="sm" onClick={autoLayout}>
                                <LayoutGrid className="h-4 w-4 sm:mr-2" />
                                <span className={COMPACT_LABEL}>{t('flowchart.autoLayout')}</span>
                            </Button>

                            <Button variant="outline" size="sm" onClick={exportToPng}>
                                <Download className="h-4 w-4 sm:mr-2" />
                                <span className={COMPACT_LABEL}>{t('flowchart.exportPng')}</span>
                            </Button>

                            {currentCase && (
                                <Button variant="outline" size="sm" onClick={buildFromCase}>
                                    <FileInput className="h-4 w-4 sm:mr-2" />
                                    <span className={COMPACT_LABEL}>{t('flowchart.buildFromCase')}</span>
                                </Button>
                            )}
                        </div>
                    </div>
                    <CurrentDebateStrip hidden={Boolean(workspace.context)} className="mt-3" />
                </CardHeader>
                <CardContent className="p-0">
                    {/* Stats Bar */}
                    <div className="flex flex-wrap gap-2 p-4 border-b bg-muted/30">
                        <Badge variant="outline" className="gap-1">
                            <Target className="h-3 w-3" /> {t('flowchart.legendThesis')}: {stats.thesis || 0}
                        </Badge>
                        <Badge variant="outline" className="gap-1 border-emerald-600 text-emerald-700 dark:text-emerald-400">
                            <Shield className="h-3 w-3" /> {t('flowchart.legendArgument')}: {stats.contention || 0}
                        </Badge>
                        <Badge variant="outline" className="gap-1 border-red-600 text-red-700 dark:text-red-400">
                            <Swords className="h-3 w-3" /> {t('flowchart.legendAttack')}: {stats.attack || 0}
                        </Badge>
                        <Badge variant="outline" className="gap-1 border-blue-600 text-blue-700 dark:text-blue-400">
                            <GitBranch className="h-3 w-3" /> {t('flowchart.legendRebuttal')}: {stats.rebuttal || 0}
                        </Badge>
                        <Badge variant="outline" className="gap-1 border-amber-600 text-amber-700 dark:text-amber-400">
                            <AlertTriangle className="h-3 w-3" /> {t('flowchart.legendDropped')}: {stats.dropped || 0}
                        </Badge>
                    </div>

                    {selectedNode && (
                        <div className="border-b bg-card/70 p-4">
                            {(() => {
                                const node = nodes.find((item) => item.id === selectedNode);
                                if (!node) return null;
                                return (
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <Badge variant="secondary">{t('flowchart.selectedNode', 'Selected')}</Badge>
                                                <h2 className="truncate text-sm font-semibold">{nodeLabel(node.data, t)}</h2>
                                            </div>
                                            {nodeDescription(node.data, t) && (
                                                <p className="mt-1 line-clamp-2 whitespace-pre-line text-sm text-muted-foreground">{nodeDescription(node.data, t)}</p>
                                            )}
                                        </div>
                                        <div className="flex shrink-0 gap-2">
                                            <Button variant="outline" size="sm" onClick={() => openEditDialog(node)}>
                                                <GitBranch className="h-4 w-4 mr-2" />
                                                {t('flowchart.edit')}
                                            </Button>
                                            {selectedNode !== 'thesis' && (
                                                <Button variant="destructive" size="sm" onClick={deleteSelectedNode}>
                                                    <Trash2 className="h-4 w-4 mr-2" />
                                                    {t('flowchart.delete')}
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    )}

                    {/* Flow Canvas */}
                    <ReactFlowProvider key={chartKey}>
                    <div ref={canvasRef} className={`h-[50vh] min-h-[400px] w-full${layoutAnimating ? ' flow-layout-animating' : ''}`}>
                        <ReactFlow
                            onInit={setFlowInstance}
                            onMove={(_, viewport) => canvasRef.current?.style.setProperty('--flow-zoom', String(viewport.zoom))}
                            // The page scrolls under the wheel; zoom uses pinch, the controls, or Ctrl+wheel.
                            zoomOnScroll={false}
                            preventScrolling={false}
                            nodes={nodes}
                            edges={labelledEdges}
                            onNodesChange={onNodesChange}
                            onEdgesChange={onEdgesChange}
                            onConnect={onConnect}
                            onNodeClick={(_, node) => setSelectedNode(node.id)}
                            onNodeDoubleClick={(_, node) => openEditDialog(node as Node<FlowNodeData>)}
                            onPaneClick={() => setSelectedNode(null)}
                            nodeTypes={nodeTypes}
                            fitView
                            fitViewOptions={FIT_VIEW}
                            // A built case is wider than a phone at React Flow's default 0.5.
                            minZoom={0.2}
                            // Top right is clear of the controls and the minimap, and fitting leaves a margin there.
                            attributionPosition="top-right"
                        >
                            <LocalizedControls />
                            <LocalizedA11yDescriptions />
                            {/* Phones have no room for an overview over the chart. */}
                            <MiniMap
                                className="max-sm:hidden"
                                ariaLabel={t('flowchart.miniMap')}
                                nodeColor={(node) => {
                                    const type = (node.data as FlowNodeData).type;
                                    switch (type) {
                                        case 'thesis': return '#3b82f6';
                                        case 'contention': return '#047857';
                                        case 'attack': return '#b91c1c';
                                        case 'rebuttal': return '#1d4ed8';
                                        case 'dropped': return '#b45309';
                                        default: return '#6b7280';
                                    }
                                }}
                            />
                            <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
                        </ReactFlow>
                    </div>
                    <CanvasControlsBar />
                    </ReactFlowProvider>
                </CardContent>
            </Card>


            {/* Legend */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-sm">{t('flowchart.legend')}</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap gap-4 text-sm">
                        <div className="flex items-center gap-2">
                            <div className="h-4 w-4 rounded bg-primary" />
                            <span>{t('flowchart.legendThesis')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="h-4 w-4 rounded bg-emerald-700" />
                            <span>{t('flowchart.legendArgument')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="h-4 w-4 rounded bg-red-700" />
                            <span>{t('flowchart.legendAttack')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="h-4 w-4 rounded bg-blue-700" />
                            <span>{t('flowchart.legendRebuttal')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="h-4 w-4 rounded bg-amber-700" />
                            <span>{t('flowchart.legendDropped')}</span>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

// src/pages/FlowchartPage.tsx
import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import ReactFlow, {
    Node,
    Edge,
    Controls,
    ControlButton,
    Background,
    MiniMap,
    useNodesState,
    useEdgesState,
    addEdge,
    Connection,
    MarkerType,
    BackgroundVariant,
    Handle,
    Position,
    useReactFlow,
    useStore,
    useStoreApi,
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
    Unlock
} from 'lucide-react';
import { toPng } from 'html-to-image';
import { formatRelativeDate } from '@/lib/date-format';
import { toast } from 'sonner';
import type { TFunction } from 'i18next';
import { CurrentDebateStrip } from '@/components/features/debate/CurrentDebateStrip';
import { useDebateStore } from '@/lib/stores/debate-store';
import { WorkspaceToolScope, useWorkspaceToolScope } from '@/components/features/workspace/WorkspaceToolScope';

// Custom node types
type NodeType = 'thesis' | 'contention' | 'attack' | 'rebuttal' | 'dropped';
type EdgeKind = 'support' | 'attack' | 'rebuttal';

interface FlowNodeData {
    label: string;
    description?: string;
    type: NodeType;
    strength?: 'strong' | 'moderate' | 'weak';
}

const nodeColors: Record<NodeType, { bg: string; border: string; text: string }> = {
    thesis: { bg: 'bg-primary', border: 'border-primary', text: 'text-primary-foreground' },
    contention: { bg: 'bg-emerald-500', border: 'border-emerald-500', text: 'text-white' },
    attack: { bg: 'bg-red-500', border: 'border-red-500', text: 'text-white' },
    rebuttal: { bg: 'bg-blue-500', border: 'border-blue-500', text: 'text-white' },
    dropped: { bg: 'bg-amber-500', border: 'border-amber-500', text: 'text-white' },
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

// React Flow's own control buttons have fixed English names, so the canvas
// renders the same four with translated ones.
function LocalizedControls() {
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

    return (
        <Controls showZoom={false} showFitView={false} showInteractive={false}>
            <ControlButton onClick={() => zoomIn()} disabled={maxZoomReached} title={t('flowchart.zoomIn')} aria-label={t('flowchart.zoomIn')}>
                <Plus />
            </ControlButton>
            <ControlButton onClick={() => zoomOut()} disabled={minZoomReached} title={t('flowchart.zoomOut')} aria-label={t('flowchart.zoomOut')}>
                <Minus />
            </ControlButton>
            <ControlButton onClick={() => fitView()} title={t('flowchart.fitView')} aria-label={t('flowchart.fitView')}>
                <Maximize />
            </ControlButton>
            <ControlButton
                onClick={toggleInteractivity}
                title={t('flowchart.toggleInteractivity')}
                aria-label={t('flowchart.toggleInteractivity')}
                aria-pressed={!isInteractive}
            >
                {isInteractive ? <Unlock /> : <Lock />}
            </ControlButton>
        </Controls>
    );
}

// 12px handles get an invisible 44px hit area on touch.
const HANDLE_CLASS = "!bg-white/50 !w-3 !h-3 !border-2 !border-white/80 pointer-coarse:after:absolute pointer-coarse:after:-inset-4 pointer-coarse:after:content-['']";

// Edges are static; rebuttals are dashed so they read apart from support without motion.
const REBUTTAL_DASH = '6 4';

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
                <Badge variant="secondary" className="text-xs uppercase bg-white/20">
                    {t(typeLabelKey)}
                </Badge>
            </div>
            <div className="font-semibold text-sm">{data.label}</div>
            {data.description && (
                <div className="text-xs opacity-80 mt-1 line-clamp-2">{data.description}</div>
            )}
            {data.strength && (
                <Badge
                    variant="outline"
                    className={`mt-2 text-xs ${data.strength === 'strong'
                        ? 'border-green-300 text-green-100'
                        : data.strength === 'weak'
                            ? 'border-red-300 text-red-100'
                            : 'border-yellow-300 text-yellow-100'
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

const edgeStyles: Record<EdgeKind, { label: string; stroke: string; dash?: string }> = {
    support: { label: 'Support', stroke: '#10b981' },
    attack: { label: 'Attack', stroke: '#ef4444' },
    rebuttal: { label: 'Rebuttal', stroke: '#3b82f6', dash: REBUTTAL_DASH },
};

// Initial sample data
function createInitialNodes(t: TFunction): Node<FlowNodeData>[] {
    return [
    {
        id: 'thesis',
        type: 'custom',
        position: { x: 400, y: 50 },
        data: { label: t('flowchart.starter.thesisLabel'), description: t('flowchart.starter.thesisDesc'), type: 'thesis' },
    },
    {
        id: 'c1',
        type: 'custom',
        position: { x: 150, y: 200 },
        data: { label: t('flowchart.starter.argument1Label'), description: t('flowchart.starter.argument1Desc'), type: 'contention', strength: 'strong' },
    },
    {
        id: 'c2',
        type: 'custom',
        position: { x: 400, y: 200 },
        data: { label: t('flowchart.starter.argument2Label'), description: t('flowchart.starter.argument2Desc'), type: 'contention', strength: 'moderate' },
    },
    {
        id: 'c3',
        type: 'custom',
        position: { x: 650, y: 200 },
        data: { label: t('flowchart.starter.argument3Label'), description: t('flowchart.starter.argument3Desc'), type: 'contention', strength: 'weak' },
    },
    {
        id: 'a1',
        type: 'custom',
        position: { x: 150, y: 350 },
        data: { label: t('flowchart.starter.opponentAttackLabel'), description: t('flowchart.starter.opponentAttackDesc'), type: 'attack' },
    },
    {
        id: 'r1',
        type: 'custom',
        position: { x: 150, y: 500 },
        data: { label: t('flowchart.starter.rebuttalLabel'), description: t('flowchart.starter.rebuttalDesc'), type: 'rebuttal' },
    },
    ];
}

const initialEdges: Edge[] = [
    { id: 'e-thesis-c1', source: 'thesis', target: 'c1', markerEnd: { type: MarkerType.ArrowClosed } },
    { id: 'e-thesis-c2', source: 'thesis', target: 'c2', markerEnd: { type: MarkerType.ArrowClosed } },
    { id: 'e-thesis-c3', source: 'thesis', target: 'c3', markerEnd: { type: MarkerType.ArrowClosed } },
    { id: 'e-c1-a1', source: 'c1', target: 'a1', style: { stroke: '#ef4444' }, markerEnd: { type: MarkerType.ArrowClosed } },
    { id: 'e-a1-r1', source: 'a1', target: 'r1', style: { stroke: '#3b82f6', strokeDasharray: REBUTTAL_DASH }, markerEnd: { type: MarkerType.ArrowClosed } },
];

export default function FlowchartPage() {
    const workspace = useWorkspaceToolScope('flowchart');
    const { t } = useTranslation();
    const {
        pendingFlowchartData,
        setPendingFlowchartData,
        saveFlowchart,
        savedFlowcharts: allSavedFlowcharts,
        deleteSavedFlowchart
    } = useSessionStore();
    // Saved flowcharts follow the Current Debate; one-off mode shows one-off flowcharts.
    const flowchartScope = useDebateStore((state) => state.oneOff ? null : state.currentDebateId);
    const savedFlowcharts = allSavedFlowcharts.filter((item) => (item.debateId ?? null) === flowchartScope);

    const [nodes, setNodes, onNodesChange] = useNodesState(createInitialNodes(t));
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

    // Save/Load dialog states
    const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
    const [saveTitle, setSaveTitle] = useState('');
    const [isLoadDialogOpen, setIsLoadDialogOpen] = useState(false);

    useEffect(() => {
        if (pendingFlowchartData) {
            setNodes(pendingFlowchartData.nodes);
            setEdges(pendingFlowchartData.edges);
            setPendingFlowchartData(null);
        }
    }, [pendingFlowchartData, setNodes, setEdges, setPendingFlowchartData]);

    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [newNodeLabel, setNewNodeLabel] = useState('');
    const [newNodeDescription, setNewNodeDescription] = useState('');
    const [newNodeType, setNewNodeType] = useState<NodeType>('contention');
    const [newNodeStrength, setNewNodeStrength] = useState<'strong' | 'moderate' | 'weak'>('moderate');
    const [selectedNode, setSelectedNode] = useState<string | null>(null);
    const [flowInstance, setFlowInstance] = useState<ReactFlowInstance | null>(null);
    const canvasRef = useRef<HTMLDivElement>(null);
    const [layoutAnimating, setLayoutAnimating] = useState(false);
    const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
    const [selectedEdgeType, setSelectedEdgeType] = useState<EdgeKind>('support');

    const onConnect = useCallback(
        (connection: Connection) => {
            const edgeStyle = edgeStyles[selectedEdgeType];
            setEdges((eds) =>
                addEdge(
                    {
                        ...connection,
                        label: edgeStyle.label,
                        style: { stroke: edgeStyle.stroke, strokeWidth: 2, ...(edgeStyle.dash ? { strokeDasharray: edgeStyle.dash } : {}) },
                        markerEnd: { type: MarkerType.ArrowClosed },
                    },
                    eds
                )
            );
        },
        [selectedEdgeType, setEdges]
    );

    const handleSaveNode = useCallback(() => {
        if (!newNodeLabel.trim()) return;

        if (editingNodeId) {
            setNodes((nds) =>
                nds.map((node) => {
                    if (node.id === editingNodeId) {
                        return {
                            ...node,
                            data: {
                                ...node.data,
                                label: newNodeLabel,
                                description: newNodeDescription,
                                type: newNodeType,
                                strength: newNodeType === 'contention' ? newNodeStrength : undefined,
                            },
                        };
                    }
                    return node;
                })
            );
            setEditingNodeId(null);
        } else {
            // A new node appears in the middle of what the user is looking at.
            const rect = canvasRef.current?.getBoundingClientRect();
            const centre = rect && flowInstance
                ? flowInstance.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
                : { x: 400, y: 250 };
            const newNode: Node<FlowNodeData> = {
                id: `node-${Date.now()}`,
                type: 'custom',
                position: { x: centre.x - 100, y: centre.y - 40 },
                data: {
                    label: newNodeLabel,
                    description: newNodeDescription,
                    type: newNodeType,
                    strength: newNodeType === 'contention' ? newNodeStrength : undefined,
                },
            };
            setNodes((nds) => [...nds, newNode]);
        }

        setNewNodeLabel('');
        setNewNodeDescription('');
        setIsAddDialogOpen(false);
    }, [newNodeLabel, newNodeDescription, newNodeType, newNodeStrength, editingNodeId, setNodes, flowInstance]);

    const handleSaveFlowchart = async () => {
        if (!saveTitle.trim()) return;

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

    const handleLoadFlowchart = (data: FlowchartData) => {
        setNodes(data.nodes);
        setEdges(data.edges);
        setSelectedNode(null);
        setIsLoadDialogOpen(false);
        toast.success(t('flowchart.loadedToast'));
    };

    // A saved flowchart can be saved again exactly, so delete acts at once and offers Undo.
    const handleDeleteFlowchart = async (item: (typeof savedFlowcharts)[number], e: React.MouseEvent) => {
        e.stopPropagation();
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
        }
    };

    const openAddDialog = () => {
        setEditingNodeId(null);
        setNewNodeLabel('');
        setNewNodeDescription('');
        setNewNodeType('contention');
        setNewNodeStrength('moderate');
        setIsAddDialogOpen(true);
    };

    const openEditDialog = useCallback((node: Node<FlowNodeData>) => {
        setEditingNodeId(node.id);
        setNewNodeLabel(node.data.label);
        setNewNodeDescription(node.data.description || '');
        setNewNodeType(node.data.type);
        if (node.data.strength) {
            setNewNodeStrength(node.data.strength);
        }
        setIsAddDialogOpen(true);
    }, []);

    // Deleting a node acts at once; Undo puts the node and its edges back.
    const deleteSelectedNode = useCallback(() => {
        if (!selectedNode || selectedNode === 'thesis') return;
        const removedNode = nodes.find((n) => n.id === selectedNode);
        if (!removedNode) return;
        const removedEdges = edges.filter((e) => e.source === selectedNode || e.target === selectedNode);
        setNodes((nds) => nds.filter((n) => n.id !== selectedNode));
        setEdges((eds) => eds.filter((e) => e.source !== selectedNode && e.target !== selectedNode));
        setSelectedNode(null);
        toast(t('flowchart.nodeDeletedNamed', { label: removedNode.data.label, defaultValue: 'Deleted {{label}}' }), {
            action: {
                label: t('common.undo', 'Undo'),
                onClick: () => {
                    setNodes((nds) => (nds.some((n) => n.id === removedNode.id) ? nds : [...nds, removedNode]));
                    setEdges((eds) => [...eds, ...removedEdges.filter((edge) => !eds.some((e) => e.id === edge.id))]);
                },
            },
        });
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
        const flowElement = document.querySelector('.react-flow') as HTMLElement;
        if (!flowElement) return;

        toPng(flowElement, {
            backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--background')
                ? `hsl(${getComputedStyle(document.documentElement).getPropertyValue('--background')})`
                : '#ffffff',
            width: flowElement.offsetWidth,
            height: flowElement.offsetHeight,
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
                                        <FolderOpen className="h-4 w-4 mr-2" />
                                        {t('flowchart.load')}
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
                                                <div
                                                    key={item.id}
                                                    className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 cursor-pointer transition-colors"
                                                    onClick={() => handleLoadFlowchart(item.data)}
                                                    role="button"
                                                    tabIndex={0}
                                                    onKeyDown={(event) => {
                                                        if (event.key === 'Enter' || event.key === ' ') {
                                                            event.preventDefault();
                                                            handleLoadFlowchart(item.data);
                                                        }
                                                    }}
                                                >
                                                    <div className="space-y-1">
                                                        <div className="font-medium">{item.title}</div>
                                                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                                                            <Clock className="h-3 w-3" />
                                                            {formatRelativeDate(item.createdAt)}
                                                        </div>
                                                    </div>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-9 w-9 text-destructive"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
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
                            <Dialog open={isSaveDialogOpen} onOpenChange={setIsSaveDialogOpen}>
                                <DialogTrigger asChild>
                                    <Button variant="outline" size="sm">
                                        <Save className="h-4 w-4 mr-2" />
                                        {t('flowchart.save')}
                                    </Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>{t('flowchart.saveFlowchartDialog')}</DialogTitle>
                                        <DialogDescription>{t('flowchart.saveFlowchartDialogDesc')}</DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-4 py-4">
                                        <div className="space-y-2">
                                            <Label>{t('flowchart.titleField')}</Label>
                                            <Input
                                                placeholder={t('flowchart.titlePlaceholder')}
                                                value={saveTitle}
                                                onChange={(e) => setSaveTitle(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                    <DialogFooter>
                                        <Button onClick={handleSaveFlowchart}>{t('flowchart.saveFlowchart')}</Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>

                            <div className="w-px h-8 bg-border mx-1" />

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
                                            <Label>{t('flowchart.labelField')}</Label>
                                            <Input
                                                placeholder={t('flowchart.labelPlaceholder')}
                                                value={newNodeLabel}
                                                onChange={(e) => setNewNodeLabel(e.target.value)}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>{t('flowchart.descriptionField')}</Label>
                                            <Textarea
                                                placeholder={t('flowchart.descPlaceholder')}
                                                value={newNodeDescription}
                                                onChange={(e) => setNewNodeDescription(e.target.value)}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>{t('flowchart.typeField')}</Label>
                                            <Select value={newNodeType} onValueChange={(v) => setNewNodeType(v as NodeType)}>
                                                <SelectTrigger>
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
                                                <Label>{t('flowchart.strengthField')}</Label>
                                                <Select value={newNodeStrength} onValueChange={(v) => setNewNodeStrength(v as 'strong' | 'moderate' | 'weak')}>
                                                    <SelectTrigger>
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

                            {selectedNode && selectedNode !== 'thesis' && (
                                <>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                            const node = nodes.find(n => n.id === selectedNode);
                                            if (node) openEditDialog(node);
                                        }}
                                    >
                                        <GitBranch className="h-4 w-4 mr-2" />
                                        {t('flowchart.edit')}
                                    </Button>
                                    <Button variant="destructive" size="sm" onClick={deleteSelectedNode}>
                                        <Trash2 className="h-4 w-4 mr-2" />
                                        {t('flowchart.delete')}
                                    </Button>
                                </>
                            )}

                            <Select value={selectedEdgeType} onValueChange={(value) => setSelectedEdgeType(value as EdgeKind)}>
                                <SelectTrigger className="h-9 w-[132px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="support">{t('flowchart.edgeSupport', 'Support')}</SelectItem>
                                    <SelectItem value="attack">{t('flowchart.edgeAttack', 'Attack')}</SelectItem>
                                    <SelectItem value="rebuttal">{t('flowchart.edgeRebuttal', 'Rebuttal')}</SelectItem>
                                </SelectContent>
                            </Select>

                            <Button variant="outline" size="sm" onClick={autoLayout}>
                                <LayoutGrid className="h-4 w-4 mr-2" />
                                {t('flowchart.autoLayout', 'Auto layout')}
                            </Button>

                            <Button variant="outline" size="sm" onClick={exportToPng}>
                                <Download className="h-4 w-4 mr-2" />
                                {t('flowchart.exportPng')}
                            </Button>
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
                        <Badge variant="outline" className="gap-1 border-emerald-500 text-emerald-600">
                            <Shield className="h-3 w-3" /> {t('flowchart.legendArgument')}: {stats.contention || 0}
                        </Badge>
                        <Badge variant="outline" className="gap-1 border-red-500 text-red-600">
                            <Swords className="h-3 w-3" /> {t('flowchart.legendAttack')}: {stats.attack || 0}
                        </Badge>
                        <Badge variant="outline" className="gap-1 border-blue-500 text-blue-600">
                            <GitBranch className="h-3 w-3" /> {t('flowchart.legendRebuttal')}: {stats.rebuttal || 0}
                        </Badge>
                        <Badge variant="outline" className="gap-1 border-amber-500 text-amber-600">
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
                                                <h3 className="truncate text-sm font-semibold">{node.data.label}</h3>
                                            </div>
                                            {node.data.description && (
                                                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{node.data.description}</p>
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
                    <div ref={canvasRef} className={`h-[50vh] min-h-[400px] w-full${layoutAnimating ? ' flow-layout-animating' : ''}`}>
                        <ReactFlow
                            onInit={setFlowInstance}
                            // The page scrolls under the wheel; zoom uses pinch, the controls, or Ctrl+wheel.
                            zoomOnScroll={false}
                            preventScrolling={false}
                            nodes={nodes}
                            edges={edges}
                            onNodesChange={onNodesChange}
                            onEdgesChange={onEdgesChange}
                            onConnect={onConnect}
                            onNodeClick={(_, node) => setSelectedNode(node.id)}
                            onNodeDoubleClick={(_, node) => openEditDialog(node as Node<FlowNodeData>)}
                            onPaneClick={() => setSelectedNode(null)}
                            nodeTypes={nodeTypes}
                            fitView
                            attributionPosition="bottom-left"
                        >
                            <LocalizedControls />
                            <MiniMap
                                ariaLabel={t('flowchart.miniMap')}
                                nodeColor={(node) => {
                                    const type = (node.data as FlowNodeData).type;
                                    switch (type) {
                                        case 'thesis': return '#3b82f6';
                                        case 'contention': return '#10b981';
                                        case 'attack': return '#ef4444';
                                        case 'rebuttal': return '#3b82f6';
                                        case 'dropped': return '#f59e0b';
                                        default: return '#6b7280';
                                    }
                                }}
                            />
                            <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
                        </ReactFlow>
                    </div>
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
                            <div className="h-4 w-4 rounded bg-emerald-500" />
                            <span>{t('flowchart.legendArgument')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="h-4 w-4 rounded bg-red-500" />
                            <span>{t('flowchart.legendAttack')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="h-4 w-4 rounded bg-blue-500" />
                            <span>{t('flowchart.legendRebuttal')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="h-4 w-4 rounded bg-amber-500" />
                            <span>{t('flowchart.legendDropped')}</span>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

// src/pages/FlowchartPage.tsx
import { useCallback, useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import ReactFlow, {
    Node,
    Edge,
    Controls,
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
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useSessionStore, FlowchartData } from '@/lib/stores/session-store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
    Clock
} from 'lucide-react';
import { toPng } from 'html-to-image';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

// Custom node types
type NodeType = 'thesis' | 'contention' | 'attack' | 'rebuttal' | 'dropped';

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
            <Handle type="target" position={Position.Top} className="!bg-white/50 !w-3 !h-3 !border-2 !border-white/80" />
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
                    {data.strength}
                </Badge>
            )}
            <Handle type="source" position={Position.Bottom} className="!bg-white/50 !w-3 !h-3 !border-2 !border-white/80" />
        </div>
    );
}

const nodeTypes = {
    custom: CustomNode,
};

// Initial sample data
const initialNodes: Node<FlowNodeData>[] = [
    {
        id: 'thesis',
        type: 'custom',
        position: { x: 400, y: 50 },
        data: { label: 'Your Thesis', description: 'Click to edit or add new nodes', type: 'thesis' },
    },
    {
        id: 'c1',
        type: 'custom',
        position: { x: 150, y: 200 },
        data: { label: 'Argument 1', description: 'Your first argument', type: 'contention', strength: 'strong' },
    },
    {
        id: 'c2',
        type: 'custom',
        position: { x: 400, y: 200 },
        data: { label: 'Argument 2', description: 'Your second argument', type: 'contention', strength: 'moderate' },
    },
    {
        id: 'c3',
        type: 'custom',
        position: { x: 650, y: 200 },
        data: { label: 'Argument 3', description: 'Your third argument', type: 'contention', strength: 'weak' },
    },
    {
        id: 'a1',
        type: 'custom',
        position: { x: 150, y: 350 },
        data: { label: 'Opponent Attack', description: 'How they might respond', type: 'attack' },
    },
    {
        id: 'r1',
        type: 'custom',
        position: { x: 150, y: 500 },
        data: { label: 'Your Rebuttal', description: 'How you counter their attack', type: 'rebuttal' },
    },
];

const initialEdges: Edge[] = [
    { id: 'e-thesis-c1', source: 'thesis', target: 'c1', animated: true, markerEnd: { type: MarkerType.ArrowClosed } },
    { id: 'e-thesis-c2', source: 'thesis', target: 'c2', animated: true, markerEnd: { type: MarkerType.ArrowClosed } },
    { id: 'e-thesis-c3', source: 'thesis', target: 'c3', animated: true, markerEnd: { type: MarkerType.ArrowClosed } },
    { id: 'e-c1-a1', source: 'c1', target: 'a1', style: { stroke: '#ef4444' }, markerEnd: { type: MarkerType.ArrowClosed } },
    { id: 'e-a1-r1', source: 'a1', target: 'r1', style: { stroke: '#3b82f6' }, markerEnd: { type: MarkerType.ArrowClosed } },
];

export default function FlowchartPage() {
    const { t } = useTranslation();
    const {
        pendingFlowchartData,
        setPendingFlowchartData,
        saveFlowchart,
        savedFlowcharts,
        deleteSavedFlowchart
    } = useSessionStore();

    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
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
    const [editingNodeId, setEditingNodeId] = useState<string | null>(null);

    const onConnect = useCallback(
        (connection: Connection) => {
            setEdges((eds) =>
                addEdge(
                    {
                        ...connection,
                        animated: true,
                        markerEnd: { type: MarkerType.ArrowClosed },
                    },
                    eds
                )
            );
        },
        [setEdges]
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
            const newNode: Node<FlowNodeData> = {
                id: `node-${Date.now()}`,
                type: 'custom',
                position: { x: Math.random() * 400 + 100, y: Math.random() * 300 + 100 },
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
    }, [newNodeLabel, newNodeDescription, newNodeType, newNodeStrength, editingNodeId, setNodes]);

    const handleSaveFlowchart = async () => {
        if (!saveTitle.trim()) return;

        try {
            await saveFlowchart(saveTitle, { nodes, edges });
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
        setIsLoadDialogOpen(false);
        toast.success(t('flowchart.loadedToast'));
    };

    const handleDeleteFlowchart = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await deleteSavedFlowchart(id);
            toast.success(t('flowchart.deletedToast'));
        } catch (error) {
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

    const deleteSelectedNode = useCallback(() => {
        if (!selectedNode || selectedNode === 'thesis') return;
        setNodes((nds) => nds.filter((n) => n.id !== selectedNode));
        setEdges((eds) => eds.filter((e) => e.source !== selectedNode && e.target !== selectedNode));
        setSelectedNode(null);
    }, [selectedNode, setNodes, setEdges]);

    const exportToPng = useCallback(() => {
        const flowElement = document.querySelector('.react-flow') as HTMLElement;
        if (!flowElement) return;

        toPng(flowElement, {
            backgroundColor: '#1e1e2e',
            width: flowElement.offsetWidth,
            height: flowElement.offsetHeight,
        }).then((dataUrl) => {
            const link = document.createElement('a');
            link.download = 'debate-flowchart.png';
            link.href = dataUrl;
            link.click();
        });
    }, []);

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
        <div className="space-y-6">
            <Card>
                <CardHeader className="bg-gradient-to-br from-primary/5 to-transparent">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                                <GitBranch className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                                <CardTitle>{t('flowchart.title')}</CardTitle>
                                <CardDescription>{t('flowchart.subtitle')}</CardDescription>
                            </div>
                        </div>
                        <div className="flex gap-2">
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
                                                >
                                                    <div className="space-y-1">
                                                        <div className="font-medium">{item.title}</div>
                                                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                                                            <Clock className="h-3 w-3" />
                                                            {formatDistanceToNow(item.createdAt, { addSuffix: true })}
                                                        </div>
                                                    </div>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-destructive opacity-70 hover:opacity-100"
                                                        onClick={(e) => handleDeleteFlowchart(item.id, e)}
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

                            <Button variant="outline" size="sm" onClick={exportToPng}>
                                <Download className="h-4 w-4 mr-2" />
                                {t('flowchart.exportPng')}
                            </Button>
                        </div>
                    </div>
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

                    {/* Flow Canvas */}
                    <div className="h-[50vh] min-h-[400px] w-full">
                        <ReactFlow
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
                            <Controls />
                            <MiniMap
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

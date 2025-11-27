// --- CONFIGURATION ---
const PATH_STROKE_COLOR = { r: 0.1, g: 0.7, b: 1 }; // Light Blue
const PATH_STROKE_WEIGHT = 2;
const PATH_OPACITY = 0.8;
const CONTROL_POINT_COLOR = { r: 1, g: 0.6, b: 0 }; // Orange
const CONTROL_POINT_SIZE = 12;
const CONTROL_POINT_NAME = "MotionDirector_CP_Marker";
const PATH_LINE_NAME = "MotionDirector_Path_Line";
const INITIAL_WIDTH = 400; 
const HEADER_HEIGHT = 40; 

// --- CORE MATH FUNCTIONS (Same as UI) ---

function calculateArcControlPoint(start, end) {
    const MID_ARC_FACTOR = 0.05; 
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance < 100) return { xc: (start.x + end.x) / 2, yc: (start.y + end.y) / 2 };

    const mx = (start.x + end.x) / 2;
    const my = (start.y + end.y) / 2;
    const nx = -dy; 
    const ny = dx;  
    
    const scale = (distance * MID_ARC_FACTOR) / distance;
    const xc = mx + nx * scale;
    const yc = my + ny * scale;

    return { xc, yc };
}

// --- PERSISTENCE HELPERS ---

function getStoredData(key) {
    const data = figma.root.getPluginData(key);
    return data ? JSON.parse(data) : null;
}

function setStoredData(key, data) {
    figma.root.setPluginData(key, JSON.stringify(data));
}

// --- PATH VISUALIZATION LOGIC ---

function clearExistingPaths() {
    const paths = figma.currentPage.findAll(node => 
        (node.name === PATH_LINE_NAME || node.name === CONTROL_POINT_NAME) && node.type === 'VECTOR'
    );
    for (const path of paths) {
        path.remove();
    }
}

function drawPath(pathData) {
    clearExistingPaths();

    const { start, end, control, isArcEnabled } = pathData;

    // 1. Determine the path definition (SVG Path D)
    let pathD = "";
    if (isArcEnabled) {
        // Quadratic Bezier Path: M startX startY Q controlX controlY endX endY
        pathD = `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`;
    } else {
        // Linear Path: M startX startY L ${end.x} ${end.y}
        pathD = `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
    }

    // 2. Create the Vector Node for the Path Line
    const pathLine = figma.createVector();
    pathLine.vectorPaths = [{
        windingRule: "EVENODD",
        data: pathD
    }];
    pathLine.name = PATH_LINE_NAME;
    pathLine.locked = true;
    pathLine.fills = [];
    pathLine.strokes = [{ 
        type: 'SOLID', 
        color: PATH_STROKE_COLOR 
    }];
    pathLine.strokeWeight = PATH_STROKE_WEIGHT;
    pathLine.opacity = PATH_OPACITY;
    pathLine.visible = true; // Ensure visibility
    pathLine.setRelaunchData({ edit: 'Move the Control Point to adjust the camera path curvature.' });
    
    // *** FIX: Must append the node to the page to make it visible ***
    figma.currentPage.appendChild(pathLine);


    let cpMarker = null;

    // 3. Create the Control Point Marker (only if arc is enabled)
    if (isArcEnabled) {
        cpMarker = figma.createVector();
        
        const HALF_SIZE = CONTROL_POINT_SIZE / 2;
        // Simple cross shape path
        const markerPathD = `M ${-HALF_SIZE} 0 L ${HALF_SIZE} 0 M 0 ${-HALF_SIZE} L 0 ${HALF_SIZE}`;
        
        cpMarker.vectorPaths = [{
            windingRule: "EVENODD",
            data: markerPathD
        }];
        
        cpMarker.name = CONTROL_POINT_NAME;
        cpMarker.x = control.x; 
        cpMarker.y = control.y;
        
        cpMarker.fills = [];
        cpMarker.strokes = [{ 
            type: 'SOLID', 
            color: CONTROL_POINT_COLOR 
        }];
        cpMarker.strokeWeight = 3;
        cpMarker.opacity = 1.0;
        cpMarker.locked = false; 
        cpMarker.visible = true; // Ensure visibility
        cpMarker.setRelaunchData({ edit: 'Move this marker to customize the arc path.' });
        
        // *** FIX: Must append the node to the page to make it visible ***
        figma.currentPage.appendChild(cpMarker);
    }

    const nodesToSelect = [pathLine];
    if (cpMarker) nodesToSelect.push(cpMarker);
    
    if (nodesToSelect.length > 0) {
        figma.currentPage.selection = nodesToSelect;
        // Optional Fix: Zoom and scroll to the path to ensure the user can see it immediately.
        figma.viewport.scrollAndZoomIntoView(nodesToSelect);
    }
}

/** Retrieves the current position of the manually moved Control Point marker. */
function getCustomControlPoint() {
    const cpMarker = figma.currentPage.findOne(node => node.name === CONTROL_POINT_NAME && node.type === 'VECTOR');
    
    if (cpMarker) {
        return {
            x: cpMarker.x,
            y: cpMarker.y,
        };
    }
    return null;
}


// --- MAIN MESSAGE HANDLER ---
figma.ui.onmessage = async (msg) => {
    
    // --- SCENE & VIEWPORT MANAGEMENT ---
    
    if (msg.type === 'capture-scene') {
        const view = figma.viewport.center;
        figma.ui.postMessage({ type: 'scene-captured', view: { x: view.x, y: view.y, zoom: figma.viewport.zoom } });
    }

    if (msg.type === 'update-viewport') {
        const safeZoom = Math.min(Math.max(msg.zoom, 0.1), 100); 

        // Using direct assignment for performance in the animation loop
        figma.viewport.center = { x: msg.x, y: msg.y };
        figma.viewport.zoom = safeZoom;
    }
    
    // --- PLUGIN UI MANAGEMENT ---
    
    if (msg.type === 'resize') {
        figma.ui.resize(msg.width, msg.height);
    }

    // --- PROJECT PERSISTENCE ---

    if (msg.type === 'set-project') {
        setStoredData(msg.name, msg.data);
    }

    if (msg.type === 'get-project') {
        const data = getStoredData(msg.name);
        figma.ui.postMessage({ type: 'load-data', data: data, projectName: msg.name });
    }
    
    // --- PATH VISUALIZATION ---
    
    if (msg.type === 'draw-path') {
        if (!msg.pathData.isArcEnabled) {
            clearExistingPaths();
        } else {
            drawPath(msg.pathData);
        }
    }
    
    if (msg.type === 'hide-paths') {
        clearExistingPaths();
    }
    
    if (msg.type === 'get-control-point') {
        const customPoint = getCustomControlPoint();
        
        // Send the found point back to the UI for storage
        figma.ui.postMessage({ 
            type: 'control-point-updated', 
            point: customPoint, 
            sceneIndex: msg.sceneIndex 
        });
    }
};


// Initialize plugin size and load default project on launch
figma.showUI(__html__, { width: INITIAL_WIDTH, height: HEADER_HEIGHT });
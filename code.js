// --- CONFIGURATION ---
const PATH_STROKE_COLOR = { r: 0.1, g: 0.7, b: 1 }; // Light Blue
const PATH_STROKE_WEIGHT = 10;
const PATH_OPACITY = 0.8;
const CONTROL_POINT_COLOR = { r: 1, g: 0.6, b: 0 }; // Orange
const CONTROL_POINT_SIZE = 12;
const CONTROL_POINT_NAME = "MotionDirector_CP_Marker";
const PATH_LINE_NAME = "MotionDirector_Path_Line";

// --- PERSISTENCE HELPERS ---

function getStoredData(key) {
    const data = figma.root.getPluginData(key);
    return data ? JSON.parse(data) : null;
}

function setStoredData(key, data) {
    figma.root.setPluginData(key, JSON.stringify(data));
}

// --- PATH VISUALIZATION LOGIC ---

function clearExistingPaths(sceneIndex = null) {
    if (sceneIndex !== null) {
        // Clear specific path - Search ROOT children only for performance
        const pathLineName = `${PATH_LINE_NAME}_${sceneIndex}`;
        const cpMarkerName = `${CONTROL_POINT_NAME}_${sceneIndex}`;
        
        const paths = figma.currentPage.children.filter(node => 
            (node.name === pathLineName || node.name === cpMarkerName) && node.type === 'VECTOR'
        );
        for (const path of paths) {
            path.remove();
        }
    } else {
        // Clear all paths - Search ROOT children only for performance
        const paths = figma.currentPage.children.filter(node => 
            (node.name.startsWith(PATH_LINE_NAME) || node.name.startsWith(CONTROL_POINT_NAME)) && node.type === 'VECTOR'
        );
        for (const path of paths) {
            path.remove();
        }
    }
}

function drawPath(pathData) {
    const { start, end, control, isArcEnabled, isCustom, sceneIndex } = pathData;
    
    // Clear only this scene's path if sceneIndex provided
    if (sceneIndex !== undefined) {
        clearExistingPaths(sceneIndex);
    }

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
    pathLine.name = sceneIndex !== undefined ? `${PATH_LINE_NAME}_${sceneIndex}` : PATH_LINE_NAME;
    pathLine.locked = true;
    pathLine.fills = [];
    pathLine.strokes = [{ 
        type: 'SOLID', 
        color: PATH_STROKE_COLOR 
    }];
    pathLine.strokeWeight = PATH_STROKE_WEIGHT;
    pathLine.opacity = PATH_OPACITY;
    pathLine.setRelaunchData({ edit: 'Move the Control Point to adjust the camera path curvature.' });

    // 3. Create the Control Point Marker (only if arc is enabled)
    let cpMarker = null;
    if (isArcEnabled) {
        cpMarker = figma.createVector();
        
        // **FIXED MARKER CREATION:** Create a small cross centered at (0,0) in its local space, 
        // then move the whole vector node to the desired control point (control.x, control.y).
        const HALF_SIZE = CONTROL_POINT_SIZE / 2;
        const markerPathD = `M ${-HALF_SIZE} 0 L ${HALF_SIZE} 0 M 0 ${-HALF_SIZE} L 0 ${HALF_SIZE}`;
        
        cpMarker.vectorPaths = [{
            windingRule: "EVENODD",
            data: markerPathD
        }];
        
        cpMarker.name = sceneIndex !== undefined ? `${CONTROL_POINT_NAME}_${sceneIndex}` : CONTROL_POINT_NAME;
        // CRITICAL: Set X and Y to the control point coordinates
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
        cpMarker.setRelaunchData({ edit: 'Move this marker to customize the arc path.' });
    }

    const nodesToSelect = [pathLine];
    if (cpMarker) nodesToSelect.push(cpMarker);
    
    if (nodesToSelect.length > 0) {
        figma.currentPage.selection = nodesToSelect;
    }
}

/** Retrieves the current position of the manually moved Control Point marker. */
function getCustomControlPoint(sceneIndex = null) {
    const cpName = sceneIndex !== null ? `${CONTROL_POINT_NAME}_${sceneIndex}` : CONTROL_POINT_NAME;
    const cpMarker = figma.currentPage.findChild(node => node.name === cpName && node.type === 'VECTOR');
    
    if (cpMarker) {
        // Since we set cpMarker.x/y to the control point in drawPath, 
        // the new custom control point is simply the marker's new x/y location after being dragged.
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
        
        // Include targetScene and pathSettingsIndex in the response if they were sent in the request
        figma.ui.postMessage({ 
            type: 'scene-captured', 
            view: { x: view.x, y: view.y, zoom: figma.viewport.zoom },
            targetScene: msg.targetScene,
            pathSettingsIndex: msg.pathSettingsIndex,
            updateIndex: msg.updateIndex
        });
    }

    if (msg.type === 'update-viewport') {
        figma.viewport.center = { x: msg.x, y: msg.y };
        figma.viewport.zoom = msg.zoom;
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
    
    if (msg.type === 'hide-path') {
        clearExistingPaths(msg.sceneIndex);
    }
    
    if (msg.type === 'delete-scene-path') {
        // Delete path when scene is deleted
        clearExistingPaths(msg.sceneIndex);
    }
    
    if (msg.type === 'get-control-point') {
        const customPoint = getCustomControlPoint(msg.sceneIndex);
        
        // Send the found point back to the UI for storage
        figma.ui.postMessage({ 
            type: 'control-point-updated', 
            point: customPoint, 
            sceneIndex: msg.sceneIndex 
        });
    }
};


// Initialize plugin size and load default project on launch
figma.showUI(__html__, { width: 354, height: 60 });
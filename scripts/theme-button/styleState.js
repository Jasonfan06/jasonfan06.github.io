const LIGHT_BUTTON_SHADOW = "3em 3em 5em rgba(0, 0, 0, 0.5), inset  -3em -5em 3em -3em rgba(0, 0, 0, 0.5), inset  4em 5em 2em -2em rgba(255, 230, 80,1)";
const DARK_BUTTON_SHADOW = "3em 3em 5em rgba(0, 0, 0, 0.5), inset  -3em -5em 3em -3em rgba(0, 0, 0, 0.5), inset  4em 5em 2em -2em rgba(255, 255, 210,1)";

const LIGHT_CLOUD_HOVER = [
    ["-24em", "10em"],
    ["-12em", "-27em"],
    ["17em", "-43em"],
    ["46em", "-39em"],
    ["70em", "-65em"],
    ["109em", "-54em"],
    ["-23em", "10em"],
    ["-11em", "-26em"],
    ["18em", "-42em"],
    ["47em", "-38em"],
    ["74em", "-64em"],
    ["110em", "-55em"]
];

const LIGHT_CLOUD_REST = [
    ["-20em", "10em"],
    ["-10em", "-25em"],
    ["20em", "-40em"],
    ["50em", "-35em"],
    ["75em", "-60em"],
    ["110em", "-50em"],
    ["-20em", "10em"],
    ["-10em", "-25em"],
    ["20em", "-40em"],
    ["50em", "-35em"],
    ["75em", "-60em"],
    ["110em", "-50em"]
];

const DARK_STAR_HOVER = [
    ["10em", "36em"],
    ["40em", "87em"],
    ["26em", "16em"],
    ["38em", "63em"],
    ["20.5em", "72em"],
    ["51.5em", "35em"]
];

const DARK_STAR_REST = [
    ["11em", "39em"],
    ["39em", "91em"],
    ["26em", "19em"],
    ["37em", "66em"],
    ["21em", "75em"],
    ["51em", "38em"]
];

function setTransforms(elements, values) {
    values.forEach((value, index) => {
        elements[index].style.transform = value;
    });
}

function setOpacity(elements, value) {
    elements.forEach((element) => {
        element.style.opacity = value;
    });
}

function positionClouds(clouds, positions) {
    positions.forEach(([right, bottom], index) => {
        clouds[index].style.right = right;
        clouds[index].style.bottom = bottom;
    });
}

function positionStars(stars, positions) {
    positions.forEach(([top, left], index) => {
        stars[index].style.top = top;
        stars[index].style.left = left;
    });
}

export function collectThemeButtonElements(root) {
    return {
        mainButton: root.querySelector(".main-button"),
        daytimeBackground: Array.from(root.querySelectorAll(".daytime-background")),
        cloud: root.querySelector(".cloud"),
        cloudList: Array.from(root.querySelectorAll(".cloud-son")),
        cloudLight: root.querySelector(".cloud-light"),
        components: root.querySelector(".components"),
        moon: Array.from(root.querySelectorAll(".moon")),
        stars: root.querySelector(".stars"),
        star: Array.from(root.querySelectorAll(".star"))
    };
}

export function applyLightState(elements) {
    elements.mainButton.style.transform = "translateX(0)";
    elements.mainButton.style.backgroundColor = "rgba(255, 195, 35,1)";
    elements.mainButton.style.boxShadow = LIGHT_BUTTON_SHADOW;
    setTransforms(elements.daytimeBackground, ["translateX(0)", "translateX(0)", "translateX(0)"]);
    elements.cloud.style.transform = "translateY(10em)";
    elements.cloudLight.style.transform = "translateY(10em)";
    elements.components.style.backgroundColor = "rgba(70, 133, 192,1)";
    setOpacity(elements.moon, "0");
    elements.stars.style.transform = "translateY(-125em)";
    elements.stars.style.opacity = "0";
}

export function applyDarkState(elements) {
    elements.mainButton.style.transform = "translateX(110em)";
    elements.mainButton.style.backgroundColor = "rgba(195, 200,210,1)";
    elements.mainButton.style.boxShadow = DARK_BUTTON_SHADOW;
    setTransforms(elements.daytimeBackground, ["translateX(110em)", "translateX(80em)", "translateX(50em)"]);
    elements.cloud.style.transform = "translateY(80em)";
    elements.cloudLight.style.transform = "translateY(80em)";
    elements.components.style.backgroundColor = "rgba(25,30,50,1)";
    setOpacity(elements.moon, "1");
    elements.stars.style.transform = "translateY(-62.5em)";
    elements.stars.style.opacity = "1";
}

export function applyLightHoverState(elements) {
    elements.mainButton.style.transform = "translateX(10em)";
    setTransforms(elements.daytimeBackground, ["translateX(10em)", "translateX(7em)", "translateX(4em)"]);
    positionClouds(elements.cloudList, LIGHT_CLOUD_HOVER);
}

export function applyDarkHoverState(elements) {
    elements.mainButton.style.transform = "translateX(100em)";
    setTransforms(elements.daytimeBackground, ["translateX(100em)", "translateX(73em)", "translateX(46em)"]);
    positionStars(elements.star, DARK_STAR_HOVER);
}

export function applyLightRestState(elements) {
    elements.mainButton.style.transform = "translateX(0em)";
    setTransforms(elements.daytimeBackground, ["translateX(0em)", "translateX(0em)", "translateX(0em)"]);
    positionClouds(elements.cloudList, LIGHT_CLOUD_REST);
}

export function applyDarkRestState(elements) {
    elements.mainButton.style.transform = "translateX(110em)";
    setTransforms(elements.daytimeBackground, ["translateX(110em)", "translateX(80em)", "translateX(50em)"]);
    positionStars(elements.star, DARK_STAR_REST);
}

# The Backend Code Folder

This folder contains the backend code files for your site. These files correspond to the ones found in the [**Backend**](https://support.wix.com/en/article/velo-working-with-the-velo-sidebar#backend) section of the **Public & Backend** 
![image](https://user-images.githubusercontent.com/89579857/184862813-e55cdd98-b723-4d64-b73c-593eb9af21c7.png) tab in the Velo sidebar. Add the following files to this folder to include them in your site:
  
+ **General backend files**  
  JavaScript code files. You can import code from these files into any other backend file on your site. These files require a `.js` file extension.

Use the following syntax to import code from backend files: 
```js 
import { myFunctionName } from 'backend/myFileName';
```  

## permissions.json
The file contains a key, `"web-methods"`, whose value is an object that can contain keys named after the web module files in your `backend` folder. Name these keys with the following syntax: `"backend/{path to file}myFile.jsw"`. The value for each file name key is an object that can contain keys named after the functions in that file. Each function key has a value with the following format:
```js
"backend/myFile.jsw": {
  "siteOwner" : {
    "invoke" : // Boolean
  },
  "siteMember" : {
    "invoke" : // Boolean
  },
  "anonymous" : {
    "invoke" : // Boolean
  }  
}
```
These values reflect the different levels of web module function permissions. You can set them using the following options:
| |`siteOwner`|`siteMember`|`anonymous`|
|-|-----------|------------|-----------|
|Owner-only access| `true` | `false` | `false`|
|Site member access| `true` | `true` | `false`|
|Anyone can access| `true` | `true`| `true`|

The `"web-methods"` object must also contain a `"*"` key. The value for this key defines the default permissions that are applied to any function whose permissions you don't set manually.

Here is an example `permissions.json` file for a site with a backend file called `helperFunctions.jsw`. The file's functions are called `calculate`, `fetchData`, and `syncWithServer`. In this case anyone can call `calculate`, site members can call `syncWithServer`, and only site owners can call `fetchData`.

```json
{
  "web-methods": {
    "*": {
      "*": {
        "siteOwner": {
          "invoke": true
        },
        "siteMember": {
          "invoke": true
        },
        "anonymous": {
          "invoke": true
        }
      }
    },
    "backend/helperFunctions.jsw": {
      "calculate": {
        "siteOwner": {
          "invoke": true
        },
        "siteMember": {
          "invoke": true
        },
        "anonymous": {
          "invoke": true
        }
      },
      "fetchData": {
        "siteOwner": {
          "invoke": true
        },
        "siteMember": {
          "invoke": false
        },
        "anonymous": {
          "invoke": false
        }
      },
      "syncWithServer": {
        "siteOwner": {
          "invoke": true
        },
        "siteMember": {
          "invoke": true
        },
        "anonymous": {
          "invoke": false
        }
      }
    }
  }
}
```
